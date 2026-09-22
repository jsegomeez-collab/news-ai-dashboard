import { existsSync, statSync } from "node:fs";
import { db } from "./db";
import { readUserSettings, writeUserSettings } from "./settings";
import { buildScriptText } from "./scriptText";
import { saveBuffer, newUploadPath, deleteUploadIfExists } from "./uploads";
import { heygenBudgetState, recordHeygenUsage, pendingHeygenCost } from "./heygenUsage";
import {
  createAvatarVideo,
  getVideoStatus,
  estimateCostFromText,
  findDefaultVoiceForAvatar,
  HEYGEN_PRICE_PER_SEC,
} from "./heygen";
import { isOpenAiKeyFormat } from "./whisper";
import { transcribeWithWordTimestamps } from "./captions";
import { createTikTokStyleCaptions } from "@remotion/captions";
import { renderCaptionedVideo } from "./remotion-render";
import { generateVideoTitle } from "./videoTitle";
import { scheduleGeneratedVideo } from "./contentItems";
import { createFileRecord, updateFile, ensureGeneratedVideosFolder } from "./drive";

export type SourceType = "script" | "competitor_script";

type SourceRow = {
  id: number;
  user_id: number;
  title: string | null;
  hook: string | null;
  puente: string | null;
  body: string | null;
  cta: string | null;
  status: string;
  format: string;
};

// scripts (guiones de noticias) no tiene columna 'puente' (eso es solo de los
// adaptados de competencia) — se pide como NULL literal para que ambas ramas
// devuelvan la misma forma de fila.
function getSource(userId: number, type: SourceType, id: number): SourceRow | null {
  const sql =
    type === "script"
      ? `SELECT id, user_id, title, hook, NULL as puente, body, cta, status, format FROM scripts WHERE id = ? AND user_id = ?`
      : `SELECT id, user_id, title, hook, puente, body, cta, status, format FROM competitor_scripts WHERE id = ? AND user_id = ?`;
  return (db.prepare(sql).get(id, userId) as SourceRow | undefined) ?? null;
}

// Dimensiones de render según formato — HeyGen ya genera el vídeo en esta
// misma proporción (ver createAvatarVideo), así que Remotion solo compone
// subtítulos encima, sin recortar ni reencuadrar nada.
function dimsForFormat(format: string): { widthPx: number; heightPx: number } {
  return format === "youtube" ? { widthPx: 1920, heightPx: 1080 } : { widthPx: 1080, heightPx: 1920 };
}

export type HeygenRender = {
  id: number;
  user_id: number;
  source_type: SourceType;
  source_id: number;
  heygen_video_id: string | null;
  // processing: esperando a HeyGen. captioning: vídeo de HeyGen ya descargado,
  // esperando transcripción (Whisper) + composición (Remotion). completed:
  // vídeo final CON subtítulos, listo para usar.
  status: "processing" | "captioning" | "completed" | "error";
  video_path: string | null;
  duration_sec: number | null;
  cost_usd: number | null;
  error_msg: string | null;
  created_at: string;
  updated_at: string;
};

export function getRender(userId: number, type: SourceType, id: number): HeygenRender | null {
  return (
    (db
      .prepare(`SELECT * FROM heygen_renders WHERE user_id = ? AND source_type = ? AND source_id = ?`)
      .get(userId, type, id) as HeygenRender | undefined) ?? null
  );
}

// cost_usd guarda de entrada la ESTIMACIÓN previa (estimateCostFromText) — no
// el coste real, que solo se conoce al terminar — para que pendingHeygenCost()
// pueda contar este render como gasto ya comprometido mientras sigue en
// curso. markRenderDownloaded() la sobrescribe con el coste real en cuanto
// HeyGen termina.
function upsertRenderProcessing(userId: number, type: SourceType, id: number, heygenVideoId: string, estimatedCostUsd: number): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO heygen_renders(user_id, source_type, source_id, heygen_video_id, status, cost_usd, created_at, updated_at)
     VALUES(?, ?, ?, ?, 'processing', ?, ?, ?)
     ON CONFLICT(source_type, source_id) DO UPDATE SET
       heygen_video_id = excluded.heygen_video_id, status = 'processing', cost_usd = excluded.cost_usd,
       error_msg = NULL, caption_attempts = 0, updated_at = excluded.updated_at`
  ).run(userId, type, id, heygenVideoId, estimatedCostUsd, now, now);
}

// Solo se llega aquí con status previo 'error' (nunca 'completed'/'processing',
// queueAvatarVideo los descarta antes) — por eso no hace falta borrar un
// video_path anterior: un render en error nunca llegó a tener archivo guardado.
function markRenderError(type: SourceType, id: number, msg: string): void {
  db.prepare(
    `UPDATE heygen_renders SET status = 'error', error_msg = ?, updated_at = ? WHERE source_type = ? AND source_id = ?`
  ).run(msg.slice(0, 500), new Date().toISOString(), type, id);
}

// El mp4 CRUDO de HeyGen ya está en disco, pero todavía le falta la pasada de
// subtítulos — por eso pasa a 'captioning', no a 'completed'.
function markRenderDownloaded(type: SourceType, id: number, videoPath: string, durationSec: number, costUsd: number): void {
  db.prepare(
    `UPDATE heygen_renders SET status = 'captioning', video_path = ?, duration_sec = ?, cost_usd = ?, error_msg = NULL, updated_at = ?
     WHERE source_type = ? AND source_id = ?`
  ).run(videoPath, durationSec, costUsd, new Date().toISOString(), type, id);
}

// video_path pasa a apuntar al vídeo FINAL (con subtítulos incrustados) — el
// mp4 crudo de HeyGen ya se borró del disco en processCaptioning() antes de
// llamar aquí, así que no queda ningún archivo intermedio huérfano.
function markCaptioningDone(type: SourceType, id: number, finalVideoPath: string): void {
  db.prepare(
    `UPDATE heygen_renders SET status = 'completed', video_path = ?, error_msg = NULL, updated_at = ?
     WHERE source_type = ? AND source_id = ?`
  ).run(finalVideoPath, new Date().toISOString(), type, id);
}

// Lanza la generación de UN guion concreto en HeyGen. Idempotente: si ya hay
// un render en curso o completado para ese guion, no relanza nada.
export async function queueAvatarVideo(
  userId: number,
  type: SourceType,
  id: number
): Promise<{ ok: boolean; error?: string; capped?: boolean }> {
  const existing = getRender(userId, type, id);
  if (existing && existing.status !== "error") {
    return { ok: true }; // processing / captioning / completed: ya en marcha o listo, no relanzar
  }

  const settings = readUserSettings(userId);
  if (!settings.heygenKey || !settings.heygenAvatarId) {
    return { ok: false, error: "Configura tu clave y avatar de HeyGen en Ajustes." };
  }

  // Autocuración: cuentas que eligieron su avatar ANTES de que existiera el
  // autorrelleno de voz (o que se quedaron desincronizadas por lo que sea) se
  // quedaban con heygen_voice_id vacío para siempre — bloqueando esta función
  // sin que ninguna llamada real llegase nunca a HeyGen. Se resuelve aquí, en
  // el momento de generar, y se guarda para que la próxima vez ya esté listo.
  let voiceId = settings.heygenVoiceId;
  if (!voiceId) {
    voiceId = (await findDefaultVoiceForAvatar(settings.heygenKey, settings.heygenAvatarId).catch(() => null)) ?? "";
    if (voiceId) writeUserSettings(userId, { heygenVoiceId: voiceId, heygenVoiceLabel: "Voz de tu clon" });
  }
  if (!voiceId) {
    return { ok: false, error: "No se pudo determinar la voz de tu avatar — vuelve a elegirlo en Ajustes." };
  }

  const source = getSource(userId, type, id);
  if (!source) return { ok: false, error: "Guion no encontrado" };

  const text = buildScriptText(source);
  if (!text.trim()) return { ok: false, error: "Guion vacío" };

  // Chequeo PREVIO por estimación (la duración/coste real solo se sabe al
  // terminar) — evita lanzar un vídeo que ya sabemos que se saldría del tope.
  // Suma también el coste ESTIMADO de los renders que ya están en curso
  // (pendingHeygenCost): sin esto, lanzar varios seguidos (selección
  // múltiple, o el propio ciclo automático que existía antes) dejaba pasar a
  // todos porque ninguno de los anteriores había "gastado" nada todavía a
  // ojos de heygenBudgetState — así fue como se coló el gasto de más que
  // vació la cuenta de HeyGen sin avisar.
  const budget = heygenBudgetState(userId);
  const estimate = estimateCostFromText(text);
  const pending = pendingHeygenCost(userId);
  if (!budget.canGenerate || (budget.maxUsd > 0 && budget.costToday + pending + estimate > budget.maxUsd)) {
    return { ok: false, capped: true, error: budget.reason ?? "Tope diario de gasto en HeyGen alcanzado" };
  }

  try {
    const videoId = await createAvatarVideo(settings.heygenKey, {
      avatarId: settings.heygenAvatarId,
      voiceId,
      text,
    });
    upsertRenderProcessing(userId, type, id, videoId, estimate);
    return { ok: true };
  } catch (e) {
    markRenderError(type, id, (e as Error).message);
    return { ok: false, error: (e as Error).message };
  }
}

// Guarda qué renders (source_type:source_id) están AHORA MISMO a mitad de un
// pollHeygenRenders/processCaptioning, para que dos llamadas solapadas dentro
// del mismo proceso (p.ej. el ciclo del worker y una comprobación al vuelo
// desde /api/heygen/renders, o dos pestañas del navegador haciendo poll cada
// pocos segundos) nunca lancen dos veces la MISMA transcripción/render — eso
// duplicaría el gasto en Whisper por nada.
const renderKeysInFlight = new Set<string>();

function scopeClause(userId?: number, source?: { type: SourceType; id: number }): { clause: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (userId !== undefined) {
    clauses.push("user_id = ?");
    params.push(userId);
  }
  if (source) {
    clauses.push("source_type = ? AND source_id = ?");
    params.push(source.type, source.id);
  }
  return { clause: clauses.length ? ` AND ${clauses.join(" AND ")}` : "", params };
}

// Sondea los renders en curso (mismo patrón que pollClassifyBatches /
// transcribePendingVideos: lanzar -> sondear en el ciclo siguiente -> guardar
// al terminar). Descarga el mp4 en cuanto HeyGen lo da por completado, porque
// su URL de descarga no es necesariamente estable a largo plazo.
// `source` acota a un único guion — lo usa /api/heygen/renders para comprobar
// AL VUELO justo el que se está mirando en pantalla, en vez de esperar hasta
// 2h al siguiente ciclo completo del worker (POLL_CRON).
export async function pollHeygenRenders(
  userId?: number,
  source?: { type: SourceType; id: number }
): Promise<{ checked: number; downloaded: number; errors: number }> {
  const { clause: scope, params } = scopeClause(userId, source);
  const rows = db
    .prepare(
      `SELECT id, user_id, source_type, source_id, heygen_video_id
       FROM heygen_renders WHERE status = 'processing'${scope}`
    )
    .all(...(params as never[])) as {
    id: number;
    user_id: number;
    source_type: SourceType;
    source_id: number;
    heygen_video_id: string;
  }[];

  let checked = 0,
    downloaded = 0,
    errors = 0;

  for (const r of rows) {
    const key = `${r.source_type}:${r.source_id}`;
    if (renderKeysInFlight.has(key)) continue;
    const settings = readUserSettings(r.user_id);
    if (!settings.heygenKey) continue; // clave borrada entretanto: se revisa si vuelve a configurarse
    checked++;
    renderKeysInFlight.add(key);
    try {
      const st = await getVideoStatus(settings.heygenKey, r.heygen_video_id);
      if (st.status === "completed" && st.videoUrl) {
        const resp = await fetch(st.videoUrl, { signal: AbortSignal.timeout(180_000) });
        if (!resp.ok) throw new Error(`descarga HTTP ${resp.status}`);
        const buf = Buffer.from(await resp.arrayBuffer());
        const saved = saveBuffer(buf, `heygen-${r.source_type}-${r.source_id}.mp4`, "heygen");
        const durationSec = st.durationSec ?? 0;
        const costUsd = durationSec * HEYGEN_PRICE_PER_SEC;
        markRenderDownloaded(r.source_type, r.source_id, saved.path, durationSec, costUsd);
        recordHeygenUsage(r.user_id, durationSec, costUsd);
        downloaded++;
      } else if (st.status === "failed") {
        markRenderError(r.source_type, r.source_id, st.error ?? "HeyGen devolvió 'failed'");
        errors++;
      }
      // pending/processing: se vuelve a comprobar en el próximo ciclo.
    } catch (e) {
      console.warn(`[heygen] render ${r.id} (${r.source_type} ${r.source_id}):`, (e as Error).message);
      markRenderError(r.source_type, r.source_id, (e as Error).message);
      errors++;
    } finally {
      renderKeysInFlight.delete(key);
    }
  }
  return { checked, downloaded, errors };
}

// Segunda fase, tras la descarga: transcribe el mp4 crudo con timestamps por
// palabra (Whisper) y compone los subtítulos encima con Remotion. Mismo
// motivo que el resto del pipeline para no exigir la clave al lanzar el
// vídeo: si el usuario todavía no configuró su clave de OpenAI (la misma que
// ya usa para transcribir competencia), el render se queda en 'captioning' en
// vez de fallar, y se retoma solo en el ciclo en que la configure.
// El resultado del pipeline SIEMPRE aterriza en Drive — completo (con
// subtítulos) si todo fue bien, o crudo (solo el avatar, tal cual lo dio
// HeyGen) si falló el paso de edición — para que un fallo de Whisper/Remotion
// nunca se traduzca en "el vídeo desapareció". No mueve ni copia el archivo,
// solo lo registra donde ya está.
function saveGeneratedVideoToDrive(
  userId: number,
  sourceType: SourceType,
  sourceId: number,
  title: string | null,
  videoPath: string,
  partial: boolean,
  note: string | null
): void {
  try {
    const folderId = ensureGeneratedVideosFolder(userId);
    const name = `${title || "vídeo"}${partial ? " (sin subtítulos)" : ""}.mp4`.slice(0, 200);
    const fileId = createFileRecord(userId, {
      folderId,
      originalName: name,
      path: videoPath,
      mime: "video/mp4",
      size: statSync(videoPath).size,
      kind: "video",
      status: "por_subir",
    });
    updateFile(userId, fileId, { linkedType: sourceType, linkedId: sourceId, notes: note });
  } catch (e) {
    console.warn(`[heygen] no se pudo guardar en Drive (${sourceType} ${sourceId}):`, (e as Error).message);
  }
}

// Tope de intentos de la pasada de subtítulos antes de rendirse: un render
// que agota la memoria del servidor (Chromium vía Remotion) mata el proceso
// entero SIN que ningún catch llegue a ejecutarse, así que sin este tope se
// reintentaba el mismo vídeo en cuanto el proceso volvía a arrancar — un
// bucle de caídas por falta de memoria, no solo un vídeo perdido.
const MAX_CAPTION_ATTEMPTS = 3;

function incrementCaptionAttempts(type: SourceType, id: number): void {
  db.prepare(
    `UPDATE heygen_renders SET caption_attempts = caption_attempts + 1, updated_at = ? WHERE source_type = ? AND source_id = ?`
  ).run(new Date().toISOString(), type, id);
}

// `source` acota a un único guion — ver pollHeygenRenders más arriba. `limit`
// tapa cuántos renders arranca de una sentada: cada uno abre Chromium+ffmpeg
// a tope de CPU, y esta instancia comparte esa CPU con la web — sin tope, si
// el worker estuvo parado un rato y se acumularon varios, el primer ciclo al
// volver a arrancar los encadenaba TODOS seguidos y dejaba la web sin CPU
// para responder durante varios minutos (visto en producción: la página
// quedaba "viva" pero tardaba minutos en cargar). Con tope, el resto del
// backlog se reparte entre los siguientes ciclos en vez de una sola ráfaga.
export async function processCaptioning(
  userId?: number,
  source?: { type: SourceType; id: number },
  limit?: number
): Promise<{ checked: number; completed: number; errors: number; noKey: number }> {
  const { clause: scope, params } = scopeClause(userId, source);
  // `limit` se aplica en JS, no con un LIMIT en el SQL: si se aplicara en el
  // SQL, un `limit` bajo (p.ej. 1 desde runVideoPipelineForUser) podría traer
  // como única fila justo un render que otra llamada solapada ya tiene en
  // `renderKeysInFlight` — sin ninguna otra fila de repuesto, esa llamada
  // procesaría CERO renders aunque hubiera más esperando. Trayendo todas las
  // filas candidatas y aplicando el tope solo a las que de verdad se arrancan
  // (`checked`), una fila en curso simplemente se salta y se prueba la
  // siguiente.
  const rows = db
    .prepare(
      `SELECT id, user_id, source_type, source_id, video_path, duration_sec, caption_attempts
       FROM heygen_renders WHERE status = 'captioning' AND video_path IS NOT NULL${scope}
       ORDER BY updated_at ASC`
    )
    .all(...(params as never[])) as {
    id: number;
    user_id: number;
    source_type: SourceType;
    source_id: number;
    video_path: string;
    duration_sec: number | null;
    caption_attempts: number;
  }[];

  let checked = 0,
    completed = 0,
    errors = 0,
    noKey = 0;

  for (const r of rows) {
    if (limit !== undefined && checked >= limit) break;
    const key = `${r.source_type}:${r.source_id}`;
    if (renderKeysInFlight.has(key)) continue;

    if (r.caption_attempts >= MAX_CAPTION_ATTEMPTS) {
      const msg = `Falló el renderizado de subtítulos ${MAX_CAPTION_ATTEMPTS} veces seguidas (probable falta de memoria en el servidor) — se deja de reintentar`;
      console.warn(`[heygen] render ${r.id} (${r.source_type} ${r.source_id}): ${msg}`);
      markRenderError(r.source_type, r.source_id, msg);
      if (existsSync(r.video_path)) {
        const source = getSource(r.user_id, r.source_type, r.source_id);
        saveGeneratedVideoToDrive(
          r.user_id,
          r.source_type,
          r.source_id,
          source?.title ?? null,
          r.video_path,
          true,
          `Vídeo del avatar sin subtítulos — ${msg}.`
        );
      }
      errors++;
      continue;
    }

    const settings = readUserSettings(r.user_id);
    if (!isOpenAiKeyFormat(settings.openaiKey)) {
      noKey++;
      continue;
    }
    checked++;
    renderKeysInFlight.add(key);
    // Se incrementa y guarda ANTES de arrancar Remotion (no en el catch): si
    // el proceso muere a media por falta de memoria, el intento ya quedó
    // contado para cuando el worker vuelva a arrancar.
    incrementCaptionAttempts(r.source_type, r.source_id);
    try {
      const source = getSource(r.user_id, r.source_type, r.source_id);
      const { widthPx, heightPx } = dimsForFormat(source?.format ?? "reel");

      const captions = await transcribeWithWordTimestamps(settings.openaiKey, r.video_path);
      const { pages } = createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds: 1200 });

      // Reutiliza la MISMA transcripción para detectar el título de cabecera
      // (no se vuelve a llamar a Whisper). No bloqueante: si falla, el vídeo
      // se renderiza igual, solo que sin cabecera arriba.
      const transcriptText = captions.map((c) => c.text).join(" ");
      const titleInfo = await generateVideoTitle(r.user_id, transcriptText);

      const outPath = newUploadPath(`captioned-${r.source_type}-${r.source_id}.mp4`, "heygen");
      await renderCaptionedVideo({
        videoPath: r.video_path,
        pages,
        durationInSeconds: r.duration_sec && r.duration_sec > 0 ? r.duration_sec : 30,
        widthPx,
        heightPx,
        outPath,
        title: titleInfo?.title ?? null,
        subtitle: titleInfo?.subtitle ?? null,
      });

      deleteUploadIfExists(r.video_path); // el crudo de HeyGen ya no hace falta, solo ocupaba disco
      markCaptioningDone(r.source_type, r.source_id, outPath);
      const finalTitle = titleInfo?.title ?? source?.title ?? null;
      saveGeneratedVideoToDrive(r.user_id, r.source_type, r.source_id, finalTitle, outPath, false, null);
      scheduleGeneratedVideo(r.user_id, r.source_type, r.source_id, finalTitle, outPath);
      completed++;
    } catch (e) {
      const msg = (e as Error).message;
      console.warn(`[heygen] subtítulos render ${r.id} (${r.source_type} ${r.source_id}):`, msg);
      markRenderError(r.source_type, r.source_id, msg);
      // No perder el trabajo de HeyGen aunque falle Whisper/Remotion: el
      // crudo (sin subtítulos ni título) se guarda igual en Drive, con una
      // nota explicando qué faltó. No se programa en el Calendario porque no
      // está terminado — solo Drive, para que quede accesible.
      if (existsSync(r.video_path)) {
        const source = getSource(r.user_id, r.source_type, r.source_id);
        saveGeneratedVideoToDrive(
          r.user_id,
          r.source_type,
          r.source_id,
          source?.title ?? null,
          r.video_path,
          true,
          `Vídeo del avatar sin subtítulos — falló el paso de edición: ${msg.slice(0, 300)}`
        );
      }
      errors++;
    } finally {
      renderKeysInFlight.delete(key);
    }
  }
  return { checked, completed, errors, noKey };
}
