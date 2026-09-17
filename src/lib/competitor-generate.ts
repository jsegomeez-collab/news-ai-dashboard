import { client, recordUsage, firstText, parseJsonFromText } from "./anthropic";
import { buildBrain } from "./brand";
import { readUserSettings } from "./settings";
import { getVideo, saveAnalysis, saveAdaptedScript, setVideoStatus, competitorScriptsToday } from "./competitor";
import { db } from "./db";

// ─── Análisis viral ───────────────────────────────────────────────────────────

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    hook:              { type: "string", description: "El gancho exacto (primeros 3-5 segundos). Cita literal si puedes." },
    hook_type:         { type: "string", description: "Tipo de gancho: 'curiosidad' | 'problema' | 'dato-impactante' | 'controversia' | 'pregunta' | 'transformacion' | 'secreto' | 'promesa'." },
    winning_idea:      { type: "string", description: "La idea central ganadora en una frase. El 'por qué' alguien lo va a compartir." },
    curiosity_gap:     { type: "string", description: "Qué gap de curiosidad crea y cómo lo resuelve (o no)." },
    viral_pattern:     { type: "string", description: "El patrón viral que usa: shock, utilidad, emoción, identificación, aspiración…" },
    why_it_works:      { type: "string", description: "Explicación breve de por qué funciona psicológicamente." },
    content_structure: { type: "string", description: "Estructura del contenido: cómo empieza, desarrolla y cierra." },
    viral_score:       { type: "integer", description: "Potencial viral estimado 0-100 (solo el contenido, sin contar la audiencia ya construida)." },
  },
  required: ["hook", "hook_type", "winning_idea", "curiosity_gap", "viral_pattern", "why_it_works", "content_structure", "viral_score"],
  additionalProperties: false,
} as const;

type AnalysisOut = {
  hook: string;
  hook_type: string;
  winning_idea: string;
  curiosity_gap: string;
  viral_pattern: string;
  why_it_works: string;
  content_structure: string;
  viral_score: number;
};

const ANALYSIS_SYSTEM =
  "Eres un estratega de contenido viral especializado en redes sociales. Analizas transcripciones de videos que se han viralizado " +
  "para destilar con precisión quirúrgica QUÉ los hace funcionar: el gancho exacto, la idea central, el patrón psicológico, " +
  "la estructura. Eres honesto y específico — nada de generalidades. Devuelve SOLO JSON válido.";

// ─── Generación de guion adaptado ─────────────────────────────────────────────

const ADAPTED_SCHEMA = {
  type: "object",
  properties: {
    title:            { type: "string", description: "Título interno del guion (corto, para identificarlo)." },
    hook:             { type: "string", description: "Los primeros ~10 segundos del video original, siempre en ESPAÑOL. Si el original es en español: copia LITERAL. Si es en inglés u otro idioma: traducción DIRECTA y FIEL (mismo ritmo, misma cadencia, misma fuerza emocional — solo cambia el idioma, nada más). PROHIBIDO adaptar, mejorar o parafrasear." },
    puente:           { type: "string", description: "1-2 frases de transición hacia la oferta del creador — SOLO si el tema conecta de forma natural con negocios/marketing/ventas/automatización con IA. Si el video es puramente técnico o informativo (una herramienta, un repositorio, un paper) sin ángulo de negocio natural, déjalo vacío (''). Nunca fuerces una conexión artificial." },
    body:             { type: "string", description: "El cuerpo del guion con el MÍNIMO cambio posible respecto al original: mismo contenido, mismo orden, mismo nivel de detalle — solo ajustado en idioma (si aplica) y en tono a la voz del creador. Si el tema conecta de forma natural con su oferta, puedes tejerlo con sutileza; si no, déjalo informativo tal cual, sin forzar venta. Puedes recortar partes redundantes o aburridas del original, nunca añadir contenido nuevo para alargarlo." },
    cta:              { type: "string", description: "CTA alineado con la oferta del creador — SOLO si el contenido lo justifica. Si el video es puramente técnico/informativo sin ángulo de venta, usa un CTA nativo y suave (seguir, guardar) o déjalo vacío (''); un CTA de venta forzado en contenido que no pega es peor que no ponerlo." },
    adaptation_notes: { type: "string", description: "En 1 frase: qué se cambió (idioma/tono/recortes) y si se aplicó bridge a la oferta o se dejó el contenido tal cual por no tener conexión natural con el negocio." },
  },
  required: ["title", "hook", "puente", "body", "cta", "adaptation_notes"],
  additionalProperties: false,
} as const;

type AdaptedOut = {
  title: string;
  hook: string;
  puente: string;
  body: string;
  cta: string;
  adaptation_notes: string;
};

// ─── Filtro de calidad: autocrítica + optimización antes de dar el guion por bueno ──
// Detectado un bug real: el body a veces repetía, con otras palabras, lo mismo
// que ya decía el cta (o el puente) — la generación en un solo paso no se
// autorrevisaba. Este segundo paso obliga al modelo a puntuarse con dureza y
// corregir duplicados antes de guardar nada.

const REFINE_SCHEMA = {
  type: "object",
  properties: {
    score:        { type: "integer", description: "Autopuntuación honesta 0-10 del guion recién generado, ANTES de tus correcciones. No infles la nota: un 10 es raro." },
    issues_found: { type: "string", description: "Problemas concretos encontrados (duplicaciones entre body/cta/puente, frases repetidas, cortes sin sentido, contradicciones), o 'Ninguno' si estaba limpio." },
    hook:         { type: "string", description: "EXACTAMENTE igual al hook que te paso — PROHIBIDO tocarlo, ni una palabra distinta." },
    puente:       { type: "string", description: "Puente ya corregido (igual que el original si no tenía ningún problema)." },
    body:         { type: "string", description: "Cuerpo corregido: sin repetir ninguna frase o idea que también esté en el CTA o el puente, sin repeticiones dentro de sí mismo, fluido de principio a fin." },
    cta:          { type: "string", description: "CTA corregido: si esa idea ya se dijo en el body, dila UNA sola vez (quítala de aquí, no la repitas)." },
  },
  required: ["score", "issues_found", "hook", "puente", "body", "cta"],
  additionalProperties: false,
} as const;

type RefineOut = {
  score: number;
  issues_found: string;
  hook: string;
  puente: string;
  body: string;
  cta: string;
};

const REFINE_SYSTEM =
  "Eres el editor final que revisa un guion justo antes de darlo por publicable. Actúas como un filtro de " +
  "calidad honesto y exigente — nada de aprobar algo mediocre solo por quedar bien.\n\n" +
  "Tu proceso:\n" +
  "1. Autopuntúa el guion del 1 al 10 siendo TOTALMENTE honesto contigo mismo (no infles la nota).\n" +
  "2. Revisa especialmente si hay CONTENIDO DUPLICADO: frases o ideas que aparecen tanto en el body como en " +
  "el CTA (o el puente), o repetidas dentro del propio body — es el fallo más común al adaptar guiones y hay " +
  "que cazarlo siempre.\n" +
  "3. Revisa que el guion completo tenga sentido de principio a fin y esté listo para grabarse tal cual, sin " +
  "cortes raros ni contradicciones.\n" +
  "4. Corrige lo que haga falta y devuelve la versión FINAL.\n\n" +
  "REGLA ABSOLUTA: el campo 'hook' se copia EXACTAMENTE igual al que te paso, sin tocar ni una palabra. " +
  "Si el guion ya estaba limpio, devuélvelo tal cual — no inventes cambios porque sí.\n\n" +
  "Devuelve SOLO JSON válido.";

async function refineAdaptedScript(
  userId: number,
  apiKey: string,
  model: string,
  draft: AdaptedOut
): Promise<RefineOut | null> {
  try {
    const prompt =
      `Revisa este guion adaptado antes de darlo por bueno:\n\n` +
      `HOOK: ${draft.hook}\n\nPUENTE: ${draft.puente || "(vacío)"}\n\nBODY: ${draft.body}\n\nCTA: ${draft.cta || "(vacío)"}`;

    const msg = await client(apiKey).messages.create({
      model,
      max_tokens: 2000,
      system: REFINE_SYSTEM,
      output_config: { format: { type: "json_schema", schema: REFINE_SCHEMA } },
      messages: [{ role: "user", content: prompt }],
    } as never);
    recordUsage(userId, model, (msg as never as { usage: never }).usage);
    return parseJsonFromText<RefineOut>(firstText(msg as never));
  } catch (e) {
    console.warn("[comp-gen] filtro de calidad falló:", (e as Error).message);
    return null;
  }
}

const ADAPTED_PERSONA =
  "Eres el Head of Content de una marca personal de IA aplicada a negocios digitales. " +
  "Te han dado la transcripción de un reel viral de la competencia y el análisis de por qué funciona. " +
  "Tu trabajo NO es reescribir el video para venderlo — es adaptarlo con el MÍNIMO cambio posible, " +
  "manteniendo casi intacto el contenido, la duración y el ritmo del original.\n\n" +

  "REGLA ABSOLUTA — PROHIBIDO MODIFICAR EL HOOK:\n" +
  "El campo 'hook' es una copia/traducción FIEL de las primeras líneas del original, palabra por palabra:\n" +
  "  - Si el original está en ESPAÑOL: copia LITERAL. Cero cambios, ni una palabra distinta.\n" +
  "  - Si está en otro idioma: SOLO se traduce de forma mecánica y directa (nunca se mejora ni parafrasea), " +
  "    conservando el mismo ritmo, cadencia y estructura de frase.\n" +
  "Bajo ninguna circunstancia se reescribe, resume, mejora o adapta el hook. Está PROHIBIDO tocarlo más allá " +
  "de la traducción literal cuando aplique.\n\n" +

  "REGLA — VARIACIÓN MÍNIMA EN TODO EL GUION:\n" +
  "El resto (puente + body + cta) también debe parecerse MUCHO al original — esto NO es una reescritura libre " +
  "con el pretexto de 'adaptarlo a mi marca'. Cambia solo lo estrictamente necesario: idioma si aplica, y ajustes " +
  "ligeros de tono para que suene a la voz del creador. No inventes contenido nuevo, no alargues, no rellenes. " +
  "Si el original tiene una parte redundante, lenta o aburrida, puedes recortarla — pero nunca compenses un " +
  "recorte añadiendo material nuevo para alargar el guion.\n\n" +

  "REGLA — EL BRIDGE A LA OFERTA ES OPCIONAL, NUNCA FORZADO:\n" +
  "Solo conectas el contenido con la oferta/marca del creador ('puente' y un 'cta' de venta) SI el tema tiene " +
  "una relación natural con negocios digitales, marketing, ventas o automatización con IA. Si el video trata de " +
  "algo puramente técnico sin ángulo de negocio — un repositorio de GitHub, una herramienta o modelo concreto, " +
  "un paper, una feature de un producto — NO fuerces la venta: deja 'puente' vacío ('') y usa un 'cta' suave y " +
  "nativo (o vacío) en vez de un pitch. Un guion informativo que se queda tal cual, sin vender nada, es el " +
  "resultado correcto en ese caso — forzar un 'cómprame' donde no pega es peor que no ponerlo.\n\n" +

  "Devuelve SOLO JSON válido.";

function formatBrief(format: "reel" | "youtube"): string {
  return format === "reel"
    ? "FORMATO: REEL / VIDEO CORTO. Gancho potente en los primeros segundos, UNA idea central, ritmo ágil de " +
      "frases cortas. Body en texto hablado natural."
    : "FORMATO: YOUTUBE. Puede ser algo más explicativo que un reel (gancho, contexto, desarrollo, cierre), " +
      "pero SIN inflar de relleno solo por ser 'formato largo' — la duración real la marca el video original " +
      "(ver más abajo), no el formato de destino.";
}

const WORDS_PER_SECOND = 2.6; // ritmo hablado natural en español para contenido dinámico de redes.

// La duración del guion adaptado debe seguir la del video ORIGINAL, no un
// rango genérico por formato — si el original dura 43s, el adaptado no puede
// acabar durando 1:15. Si no se conoce la duración (falta el metadato), se
// deja a criterio del modelo sin una cifra concreta que inventar.
function durationBrief(durationSec: number | null): string {
  if (!durationSec || durationSec <= 0) {
    return "\nNo se conoce la duración exacta del original: no te excedas de lo necesario para transmitir la idea con dinamismo — mejor corto y directo que largo y denso.\n";
  }
  const targetWords = Math.round(durationSec * WORDS_PER_SECOND);
  const mm = Math.floor(durationSec / 60);
  const ss = Math.round(durationSec % 60);
  const label = mm > 0 ? `${mm}:${String(ss).padStart(2, "0")}` : `${ss}s`;
  return (
    `\n--- DURACIÓN OBJETIVO (MUY IMPORTANTE) ---\n` +
    `El video original dura ${label} (~${targetWords} palabras habladas a ritmo natural). Tu guion completo ` +
    `(hook+puente+body+cta leído en voz alta) debe durar PRÁCTICAMENTE LO MISMO — nunca bastante más. Si el ` +
    `original tiene partes redundantes o de relleno, CÓRTALAS para acercarte a esa duración mientras lo haces ` +
    `más dinámico; no añadas contenido para compensar un recorte.\n`
  );
}

// ─── Pipeline completo para UN video ─────────────────────────────────────────

export async function analyseAndAdapt(userId: number, videoId: number): Promise<{
  ok: boolean;
  generated: number;
  error?: string;
  capped?: boolean; // true si se saltó por el tope DIARIO de Ajustes (no es un fallo real)
}> {
  const video = getVideo(userId, videoId);
  if (!video) return { ok: false, generated: 0, error: "Video no encontrado" };
  if (!video.transcript) return { ok: false, generated: 0, error: "Sin transcripción disponible" };

  const settings = readUserSettings(userId);
  if (!settings.anthropicKey.startsWith("sk-ant-")) {
    return { ok: false, generated: 0, error: "Configura tu clave de Anthropic en Ajustes." };
  }

  // Tope DIARIO de guiones adaptados de competencia (Ajustes → Espionaje de
  // competencia, 0 = sin tope). Se comprueba aquí porque este es el único
  // punto por el que pasan las TRES vías de generación (ciclo automático,
  // botón "Actualizar ahora" y botón manual por video) — el video se queda en
  // 'analysing' y se retoma solo cuando el tope resetee a medianoche UTC.
  if (settings.competitorAdaptLimit > 0) {
    const doneToday = competitorScriptsToday(userId);
    if (doneToday >= settings.competitorAdaptLimit) {
      return {
        ok: false,
        generated: 0,
        capped: true,
        error: `Tope diario de guiones adaptados alcanzado (${doneToday}/${settings.competitorAdaptLimit}). Se resetea a medianoche (UTC) — o ajústalo en Ajustes.`,
      };
    }
  }

  const model = settings.genModel;
  const brain = buildBrain(userId);

  // ── 1. Análisis viral ──────────────────────────────────────────────────────
  try {
    const analysisPrompt =
      `Analiza esta transcripción de un video que se ha viralizado.\n\n` +
      `Plataforma: ${video.account_platform} · Cuenta: @${video.account_handle}\n` +
      `Título: ${video.title ?? "(sin título)"}\n` +
      (video.views ? `Vistas: ${video.views.toLocaleString()}\n` : "") +
      (video.likes ? `Likes: ${video.likes.toLocaleString()}\n` : "") +
      (video.comments ? `Comentarios: ${video.comments.toLocaleString()}\n` : "") +
      `\n--- TRANSCRIPCIÓN ---\n${video.transcript.slice(0, 4000)}`;

    const analysisMsg = await client(settings.anthropicKey).messages.create({
      model,
      max_tokens: 1200,
      system: ANALYSIS_SYSTEM,
      output_config: { format: { type: "json_schema", schema: ANALYSIS_SCHEMA } },
      messages: [{ role: "user", content: analysisPrompt }],
    } as never);

    recordUsage(userId, model, (analysisMsg as never as { usage: never }).usage);
    const analysis = parseJsonFromText<AnalysisOut>(firstText(analysisMsg as never));

    if (analysis) {
      saveAnalysis(videoId, { ...analysis, model });
      setVideoStatus(videoId, "done");
    }
  } catch (e) {
    console.warn(`[comp-gen] análisis video ${videoId}:`, (e as Error).message);
    setVideoStatus(videoId, "error", `Análisis falló: ${(e as Error).message.slice(0, 300)}`);
    return { ok: false, generated: 0, error: (e as Error).message };
  }

  // Recuperamos el video con el análisis recién guardado.
  const videoWithAnalysis = getVideo(userId, videoId);

  // ── 2. Generación del guion adaptado (por formato) ────────────────────────
  const formats = settings.formats;
  const generatedIds: number[] = [];

  const systemBlocks = [
    { type: "text" as const, text: ADAPTED_PERSONA },
    {
      type: "text" as const,
      text: `--- CEREBRO DE MARCA (úsalo para todo) ---\n${brain.combined}`,
      cache_control: { type: "ephemeral" as const },
    },
  ];

  // Las primeras ~150 palabras suelen cubrir los primeros 10 segundos de un
  // reel; no depende del formato, así que se calcula una sola vez fuera del
  // bucle en vez de volver a trocear la transcripción completa por formato.
  const transcript = video.transcript!;
  const firstWords = transcript.split(/\s+/).slice(0, 150).join(" ");

  for (const format of formats) {
    try {
      const genPrompt =
        `${formatBrief(format as "reel" | "youtube")}\n` +
        durationBrief(video.duration_sec) +
        `\n--- VIDEO ORIGINAL (@${video.account_handle}, ${video.account_platform}) ---\n` +
        `Vistas: ${video.views?.toLocaleString() ?? "?"}  Likes: ${video.likes?.toLocaleString() ?? "?"}  Comentarios: ${video.comments?.toLocaleString() ?? "?"}\n\n` +
        (videoWithAnalysis?.hook ? `GANCHO ANALIZADO: ${videoWithAnalysis.hook}\n` : "") +
        (videoWithAnalysis?.hook_type ? `TIPO DE GANCHO: ${videoWithAnalysis.hook_type}\n` : "") +
        (videoWithAnalysis?.winning_idea ? `IDEA GANADORA: ${videoWithAnalysis.winning_idea}\n` : "") +
        (videoWithAnalysis?.why_it_works ? `POR QUÉ FUNCIONA: ${videoWithAnalysis.why_it_works}\n` : "") +
        (videoWithAnalysis?.content_structure ? `ESTRUCTURA: ${videoWithAnalysis.content_structure}\n` : "") +
        `\n--- PRIMERAS ~150 PALABRAS (≈10 seg) — ESTO VA EN 'hook', LITERAL, SIN CAMBIAR NADA ---\n${firstWords}\n` +
        `\n--- TRANSCRIPCIÓN COMPLETA ---\n${transcript.slice(0, 3000)}\n\n` +
        `INSTRUCCIÓN:\n` +
        `1. Campo 'hook': copia EXACTAMENTE las primeras ~150 palabras de arriba. Ni una palabra diferente (o su traducción literal si el original no está en español). PROHIBIDO tocarlo de cualquier otra forma.\n` +
        `2. Decide si el tema conecta de forma NATURAL con mi negocio (IA aplicada a negocios digitales, marketing, ventas, automatización). Si NO conecta (contenido técnico/informativo sin ángulo de venta): 'puente' y 'cta' van vacíos o con un cierre suave, y 'body' se queda prácticamente como el original, solo traducido y ajustado de tono.\n` +
        `3. Si SÍ conecta: 'puente' (1-2 frases) lleva del hook a mi oferta, y 'body'/'cta' se pueden alinear con ella — pero sin inflar el guion ni alejarte del contenido original.\n` +
        `4. Respeta la DURACIÓN OBJETIVO de arriba: si el original es corto, el adaptado es corto. Corta lo redundante del original en vez de rellenar.\n` +
        `La variación respecto al original debe ser mínima en todos los campos salvo el bridge opcional a mi oferta.`;

      const genMsg = await client(settings.anthropicKey).messages.create({
        model,
        max_tokens: format === "youtube" ? 8000 : 1500,
        system: systemBlocks,
        output_config: { format: { type: "json_schema", schema: ADAPTED_SCHEMA } },
        messages: [{ role: "user", content: genPrompt }],
      } as never);

      recordUsage(userId, model, (genMsg as never as { usage: never }).usage, 1);
      const out = parseJsonFromText<AdaptedOut>(firstText(genMsg as never));
      if (out) {
        // Filtro de calidad antes de guardar: autocrítica + corrección de
        // duplicados (sobre todo cta repetido dentro del body). Si el filtro
        // falla por lo que sea, se guarda el borrador tal cual en vez de
        // perder el guion — mejor sin pulir que sin generar.
        const refined = await refineAdaptedScript(userId, settings.anthropicKey, model, out);
        const final: AdaptedOut = refined
          ? {
              title: out.title,
              hook: out.hook, // el hook NUNCA se toca, ni siquiera si el filtro lo cambia
              puente: refined.puente,
              body: refined.body,
              cta: refined.cta,
              adaptation_notes:
                out.adaptation_notes +
                ` · Autocrítica: ${refined.score}/10` +
                (refined.issues_found && refined.issues_found.trim().toLowerCase() !== "ninguno"
                  ? ` — ${refined.issues_found}`
                  : ""),
            }
          : out;
        const id = saveAdaptedScript(userId, videoId, format, final, model);
        generatedIds.push(id);
      }
    } catch (e) {
      console.warn(`[comp-gen] generación video ${videoId} (${format}):`, (e as Error).message);
    }
  }

  return { ok: true, generated: generatedIds.length };
}

// ─── Pipeline masivo: analizar y adaptar TODOS los videos en estado 'analysing' ──

// `limit` es un tope TÉCNICO de cuántos videos se intentan en esta llamada
// (evitar que un ciclo/request se alargue demasiado) — no tiene relación con
// el tope DIARIO de Ajustes, que se aplica dentro de analyseAndAdapt() y
// aplica por igual a las tres vías de generación (ciclo, "Actualizar ahora"
// y botón manual por video).
//
// Sin userId: todos los usuarios (worker de fondo). Con userId: solo los de
// ese usuario (endpoints HTTP por-usuario, para no gastar el presupuesto de
// otros usuarios como efecto colateral de un botón individual).
//
// `processed` cuenta videos cuyo ANÁLISIS salió bien (puede ser 0 guiones
// generados si la fase de generación falla para todos los formatos —
// analyseAndAdapt devuelve ok:true igualmente). `scriptsGenerated` es el
// número real de guiones adaptados creados; `noScriptCount` son videos
// analizados sin ni un guion, señal de que la generación está fallando en
// silencio aunque el análisis vaya bien. `cappedSkipped` son videos que ni
// se intentaron por haber alcanzado ya el tope diario (no cuenta como error).
export async function processAnalysingVideos(
  limit = 3,
  userId?: number
): Promise<{ processed: number; errors: number; scriptsGenerated: number; noScriptCount: number; cappedSkipped: number }> {
  const scope = userId !== undefined ? ` AND ca.user_id = ?` : ``;
  const unlimited = limit <= 0;
  const baseParams = userId !== undefined ? [userId] : [];
  const params = unlimited ? baseParams : [...baseParams, limit];
  const rows = db
    .prepare(
      `SELECT cv.id, ca.user_id
       FROM competitor_videos cv
       JOIN competitor_accounts ca ON ca.id = cv.account_id
       WHERE cv.status = 'analysing'${scope}
       ORDER BY cv.fetched_at ASC
       ${unlimited ? "" : "LIMIT ?"}`
    )
    .all(...(params as never[])) as { id: number; user_id: number }[];

  let processed = 0, errors = 0, scriptsGenerated = 0, noScriptCount = 0, cappedSkipped = 0;
  for (const { id, user_id } of rows) {
    const r = await analyseAndAdapt(user_id, id);
    if (r.capped) {
      cappedSkipped++;
      continue;
    }
    if (r.ok) {
      processed++;
      scriptsGenerated += r.generated;
      if (r.generated === 0) {
        noScriptCount++;
        console.warn(`[comp-gen] video ${id}: análisis OK pero 0 guiones generados (revisa formatos/clave en Ajustes)`);
      }
    } else {
      errors++;
    }
  }
  return { processed, errors, scriptsGenerated, noScriptCount, cappedSkipped };
}
