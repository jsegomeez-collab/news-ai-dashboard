import { db } from "./db";
import { pollAllSources } from "./sources";
import { classifyPending, pollClassifyBatches } from "./classify";
import { generateForArticle } from "./generate";
import { critiqueScript } from "./critique";
import { budgetState } from "./budget";
import { readUserSettings, withinGenerationWindow } from "./settings";
import { pollCompetitorAccounts, type CompetitorPollResult } from "./competitor-pipeline";
import { transcribePendingVideos, type TranscribeResult } from "./whisper";
import { processAnalysingVideos } from "./competitor-generate";
import { pruneStaleTranscribedVideos } from "./competitor";
import { recordHeartbeat } from "./heartbeat";
import { pollHeygenRenders, triggerApprovedScripts } from "./heygen-generate";

// Usuarios que tienen una clave de Anthropic configurada.
export function activeUserIds(): number[] {
  return (
    db
      .prepare(`SELECT user_id FROM user_settings WHERE anthropic_key LIKE 'sk-ant-%'`)
      .all() as { user_id: number }[]
  ).map((r) => r.user_id);
}

// Procesa la cola de generación de un usuario respetando auto, ventana y topes.
export async function processGenQueue(
  userId: number
): Promise<{ generated: number; skipped: string | null }> {
  const s = readUserSettings(userId);
  if (!s.autoGenerate) return { generated: 0, skipped: "Generación automática desactivada" };
  if (!withinGenerationWindow(s)) return { generated: 0, skipped: "Fuera de la ventana de generación" };

  const queued = db
    .prepare(`SELECT article_id FROM gen_queue WHERE user_id = ? AND done = 0 ORDER BY enqueued_at ASC`)
    .all(userId) as { article_id: number }[];

  let generated = 0;
  for (const { article_id } of queued) {
    const budget = budgetState(userId);
    if (!budget.canGenerate) return { generated, skipped: budget.reason };
    const scriptIds = await generateForArticle(userId, article_id);
    for (const sid of scriptIds) {
      await critiqueScript(sid);
      generated++;
    }
    db.prepare(`UPDATE gen_queue SET done = 1 WHERE user_id = ? AND article_id = ?`).run(userId, article_id);
  }
  return { generated, skipped: null };
}

// Generación MANUAL bajo demanda (botón "Guionizar"). Ignora auto y ventana,
// pero respeta el tope de gasto diario.
export async function generateNow(
  userId: number,
  articleId: number
): Promise<{ ok: boolean; generated: number; error?: string }> {
  const s = readUserSettings(userId);
  if (!s.anthropicKey.startsWith("sk-ant-")) {
    return { ok: false, generated: 0, error: "Configura tu clave de Anthropic en Ajustes." };
  }
  const budget = budgetState(userId);
  if (!budget.canGenerate) return { ok: false, generated: 0, error: budget.reason ?? "Tope diario alcanzado" };
  try {
    // Si el artículo no está clasificado para este usuario, clasifícalo primero (sync rápido).
    const classified = db
      .prepare(`SELECT 1 FROM classifications WHERE user_id = ? AND article_id = ?`)
      .get(userId, articleId);
    if (!classified) await classifyOne(userId, articleId);

    const scriptIds = await generateForArticle(userId, articleId);
    for (const sid of scriptIds) await critiqueScript(sid);
    db.prepare(
      `INSERT INTO gen_queue(user_id, article_id, enqueued_at, done) VALUES(?, ?, ?, 1)
       ON CONFLICT(user_id, article_id) DO UPDATE SET done = 1`
    ).run(userId, articleId, new Date().toISOString());
    return { ok: true, generated: scriptIds.length };
  } catch (e) {
    return { ok: false, generated: 0, error: (e as Error).message };
  }
}

// Clasifica un único artículo de forma síncrona (para el botón Guionizar).
async function classifyOne(userId: number, articleId: number): Promise<void> {
  // Reutiliza classifyPending forzando un único pendiente sería complejo; en su
  // lugar, si no está clasificado, lanzamos clasificación general (clasifica los
  // pendientes recientes, incluido este). Barato con Haiku.
  await classifyPending(userId);
}

// Ciclo para UN usuario (botón "Actualizar ahora"): fetch global + clasificar
// y generar para este usuario. La generación respeta auto/ventana/topes.
export async function runUserCycle(
  userId: number
): Promise<{ ok: boolean; inserted: number; classified: number; generated: number; heygenQueued: number; error?: string }> {
  try {
    const poll = await pollAllSources();
    await pollClassifyBatches(userId);
    const c = await classifyPending(userId);
    const g = await processGenQueue(userId);
    await pollHeygenRenders(userId);
    const hg = await triggerApprovedScripts(userId).catch((e) => {
      console.warn(`[cycle] u${userId} HeyGen:`, (e as Error).message);
      return { queued: 0, capped: 0 };
    });
    return { ok: true, inserted: poll.inserted, classified: c.count, generated: g.generated, heygenQueued: hg.queued };
  } catch (e) {
    return { ok: false, inserted: 0, classified: 0, generated: 0, heygenQueued: 0, error: (e as Error).message };
  }
}

export type HeygenCycleResult = { checked: number; completed: number; errors: number; queued: number; capped: number };

export type CycleSummary = {
  ok: boolean;
  error?: string;
  fetched: number;
  inserted: number;
  users: number;
  classified: number;
  generated: number;
  competitor: CompetitorPollResult | null;
  transcribed: TranscribeResult | null;
  heygen: HeygenCycleResult;
};

// Un ciclo completo: fetch GLOBAL + competencia (descubrimiento + transcripción) + por usuario (clasificar/generar).
export async function runCycle(): Promise<CycleSummary> {
  const base: CycleSummary = {
    ok: true,
    fetched: 0,
    inserted: 0,
    users: 0,
    classified: 0,
    generated: 0,
    competitor: null,
    transcribed: null,
    heygen: { checked: 0, completed: 0, errors: 0, queued: 0, capped: 0 },
  };
  // Si el descubrimiento de competencia entero revienta (accountsDue()/DB, no
  // un fallo por-cuenta que ya se traga internamente), lo marcamos aparte:
  // el resto del ciclo (noticias/clasificación/guiones) puede seguir yendo
  // bien y ocultar por completo que la mitad "espionaje" está caída.
  let competitorOk = true;
  let heygenOk = true;
  try {
    // Fase 1: noticias + descubrimiento de competencia en paralelo.
    const [poll, competitor] = await Promise.all([
      pollAllSources(),
      pollCompetitorAccounts().catch((e) => {
        console.warn("[cycle] descubrimiento competencia falló:", (e as Error).message);
        competitorOk = false;
        return null;
      }),
    ]);
    base.fetched = poll.fetched;
    base.inserted = poll.inserted;
    base.competitor = competitor;

    // Fase 2: transcripción (secuencial, tras el descubrimiento).
    base.transcribed = await transcribePendingVideos(5).catch((e) => {
      console.warn("[cycle] transcripción falló:", (e as Error).message);
      competitorOk = false;
      return null;
    });

    const users = activeUserIds();
    base.users = users.length;

    // Procesa videos ya transcritos (estado 'analysing') → análisis viral + guion
    // adaptado, por usuario (antes era una única llamada global: uno con muchas
    // cuentas activas podía acaparar el ciclo entero y dejar a otros sin
    // analizar nunca). CICLOS_BATCH es solo un tope TÉCNICO para no alargar el
    // ciclo por usuario — el tope DIARIO real (Ajustes, 0 = ilimitado) lo aplica
    // analyseAndAdapt() por su cuenta y por igual en las tres vías de generación.
    const CYCLE_BATCH = 3;
    let analysedProcessed = 0, analysedNoScript = 0, analysedCapped = 0;
    for (const userId of users) {
      const r = await processAnalysingVideos(CYCLE_BATCH, userId).catch((e) => {
        console.warn(`[cycle] análisis competencia u${userId}:`, (e as Error).message);
        competitorOk = false;
        return null;
      });
      if (r) {
        analysedProcessed += r.processed;
        analysedNoScript += r.noScriptCount;
        analysedCapped += r.cappedSkipped;
      }
    }
    if (analysedNoScript > 0) {
      console.warn(
        `[cycle] competencia: ${analysedNoScript}/${analysedProcessed} video(s) analizados sin generar guion (revisa clave Anthropic / formatos por usuario)`
      );
    }
    if (analysedCapped > 0) {
      console.log(`[cycle] competencia: ${analysedCapped} video(s) en espera por tope diario de guiones adaptados (Ajustes)`);
    }

    // Limpieza: videos transcritos que llevan 60+ días sin terminar de
    // analizarse (atascados/fallidos) — no acumular basura sin límite.
    try {
      const pruned = pruneStaleTranscribedVideos();
      if (pruned > 0) console.log(`[cycle] competencia: ${pruned} video(s) transcritos y no analizados (60+ días) eliminados`);
    } catch (e) {
      console.warn("[cycle] limpieza de videos de competencia falló:", (e as Error).message);
    }

    for (const userId of users) {
      try {
        await pollClassifyBatches(userId);
        const c = await classifyPending(userId);
        base.classified += c.count;
        const g = await processGenQueue(userId);
        base.generated += g.generated;
      } catch (e) {
        console.warn(`[cycle] u${userId}:`, (e as Error).message);
      }
    }

    // Fase 5: clonación con IA (HeyGen) — sondea los vídeos en curso y lanza
    // los guiones recién aprobados, por usuario (mismo motivo que el análisis
    // de competencia: no dejar que uno con muchos guiones aprobados acapare el
    // ciclo y deje a los demás sin comprobar).
    for (const userId of users) {
      try {
        const p = await pollHeygenRenders(userId);
        base.heygen.checked += p.checked;
        base.heygen.completed += p.completed;
        base.heygen.errors += p.errors;
        if (p.errors > 0) heygenOk = false;

        const t = await triggerApprovedScripts(userId);
        base.heygen.queued += t.queued;
        base.heygen.capped += t.capped;
      } catch (e) {
        console.warn(`[cycle] u${userId} HeyGen:`, (e as Error).message);
        heygenOk = false;
      }
    }

    recordHeartbeat({
      ok: true,
      fetched: base.fetched,
      inserted: base.inserted,
      classified: base.classified,
      generated: base.generated,
      competitorOk,
      competitorChecked: base.competitor?.checked ?? 0,
      competitorInserted: base.competitor?.inserted ?? 0,
      transcribedProcessed: base.transcribed?.processed ?? 0,
      transcribedErrors: base.transcribed?.errors ?? 0,
      heygenOk,
      heygenChecked: base.heygen.checked,
      heygenCompleted: base.heygen.completed,
      heygenErrors: base.heygen.errors,
    });
    return base;
  } catch (e) {
    const failed = { ...base, ok: false, error: (e as Error).message };
    recordHeartbeat({
      ok: false,
      error: failed.error,
      fetched: failed.fetched,
      inserted: failed.inserted,
      classified: failed.classified,
      generated: failed.generated,
      competitorOk,
      competitorChecked: failed.competitor?.checked ?? 0,
      competitorInserted: failed.competitor?.inserted ?? 0,
      transcribedProcessed: failed.transcribed?.processed ?? 0,
      transcribedErrors: failed.transcribed?.errors ?? 0,
      heygenOk,
      heygenChecked: failed.heygen.checked,
      heygenCompleted: failed.heygen.completed,
      heygenErrors: failed.heygen.errors,
    });
    return failed;
  }
}
