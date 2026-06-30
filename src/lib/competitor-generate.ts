import { client, recordUsage, firstText, parseJsonFromText } from "./anthropic";
import { buildBrain } from "./brand";
import { readUserSettings } from "./settings";
import { getVideo, saveAnalysis, saveAdaptedScript, setVideoStatus } from "./competitor";
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
    hook:             { type: "string", description: "COPIA LITERAL, PALABRA POR PALABRA, de los primeros ~10 segundos del video original. Extráelo de las primeras líneas de la transcripción. NO cambies ni una sola palabra. Este es el patrón que lo viralizó y debe permanecer intacto." },
    puente:           { type: "string", description: "1-3 frases de transición que conectan el hook original (idéntico) con el vehículo único del creador. Debe sonar natural: el oyente pasa del hook viral a la propuesta de la marca sin notar el corte. Usa la voz y tonalidad del creador." },
    body:             { type: "string", description: "Cuerpo del guion a partir del puente: 100% la marca del creador, su oferta, su audiencia, su tonalidad. Mantén la estructura rítmica del original (mismo número de beats, misma cadencia) pero con el contenido propio." },
    cta:              { type: "string", description: "CTA alineado con la oferta del creador." },
    adaptation_notes: { type: "string", description: "En 1 frase: en qué segundo/línea empieza el puente y qué cambias para conectar con su marca." },
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

const ADAPTED_PERSONA =
  "Eres el Head of Content de una marca personal de IA aplicada a negocios digitales. " +
  "Te han dado la transcripción de un reel viral de la competencia y el análisis de por qué funciona.\n\n" +
  "REGLA ABSOLUTA — EL HOOK ES SAGRADO:\n" +
  "Los primeros ~10 segundos del guion son IDÉNTICOS al original, palabra por palabra. " +
  "El campo 'hook' en tu respuesta debe ser una copia EXACTA de las primeras líneas de la transcripción. " +
  "No parafrasees, no mejores, no adaptes — COPIA LITERAL. " +
  "Este es el patrón viral y no se toca. El oyente escucha exactamente lo mismo que en el video que ya se viralizó.\n\n" +
  "Lo que SÍ adaptas: el 'puente' (transición hook→marca) y el 'body' (contenido de la marca). " +
  "El resultado final debe sonar 100% a la marca del creador desde el puente en adelante, " +
  "pero los primeros 10 segundos son el gancho original sin cambiar nada. " +
  "Devuelve SOLO JSON válido.";

function formatBrief(format: "reel" | "youtube"): string {
  return format === "reel"
    ? "FORMATO: REEL / VIDEO CORTO (30-90 seg). Gancho potente en los primeros 3 seg, idea central ágil, CTA claro. Body en texto hablado natural."
    : "FORMATO: YOUTUBE / VIDEO LARGO (5-10 min). Estructura: gancho, contexto, desarrollo 2-4 puntos, ejemplo práctico, CTA. Body como guion hablado completo.";
}

// ─── Pipeline completo para UN video ─────────────────────────────────────────

export async function analyseAndAdapt(userId: number, videoId: number): Promise<{
  ok: boolean;
  generated: number;
  error?: string;
}> {
  const video = getVideo(userId, videoId);
  if (!video) return { ok: false, generated: 0, error: "Video no encontrado" };
  if (!video.transcript) return { ok: false, generated: 0, error: "Sin transcripción disponible" };

  const settings = readUserSettings(userId);
  if (!settings.anthropicKey.startsWith("sk-ant-")) {
    return { ok: false, generated: 0, error: "Configura tu clave de Anthropic en Ajustes." };
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

  for (const format of formats) {
    try {
      // Las primeras ~150 palabras suelen cubrir los primeros 10 segundos de un reel.
      const transcript = video.transcript!;
      const firstWords = transcript.split(/\s+/).slice(0, 150).join(" ");

      const genPrompt =
        `${formatBrief(format as "reel" | "youtube")}\n\n` +
        `--- VIDEO ORIGINAL (@${video.account_handle}, ${video.account_platform}) ---\n` +
        `Vistas: ${video.views?.toLocaleString() ?? "?"}  Likes: ${video.likes?.toLocaleString() ?? "?"}  Comentarios: ${video.comments?.toLocaleString() ?? "?"}\n\n` +
        (videoWithAnalysis?.hook ? `GANCHO ANALIZADO: ${videoWithAnalysis.hook}\n` : "") +
        (videoWithAnalysis?.hook_type ? `TIPO DE GANCHO: ${videoWithAnalysis.hook_type}\n` : "") +
        (videoWithAnalysis?.winning_idea ? `IDEA GANADORA: ${videoWithAnalysis.winning_idea}\n` : "") +
        (videoWithAnalysis?.why_it_works ? `POR QUÉ FUNCIONA: ${videoWithAnalysis.why_it_works}\n` : "") +
        (videoWithAnalysis?.content_structure ? `ESTRUCTURA: ${videoWithAnalysis.content_structure}\n` : "") +
        `\n--- PRIMERAS ~150 PALABRAS (≈10 seg) — ESTO VA EN 'hook', LITERAL, SIN CAMBIAR NADA ---\n${firstWords}\n` +
        `\n--- TRANSCRIPCIÓN COMPLETA ---\n${transcript.slice(0, 3000)}\n\n` +
        `INSTRUCCIÓN:\n` +
        `1. Campo 'hook': copia EXACTAMENTE las primeras ~150 palabras de arriba. Ni una palabra diferente.\n` +
        `2. Campo 'puente': 1-3 frases que conecten ese hook con mi marca/oferta de forma natural.\n` +
        `3. Campo 'body': el resto del guion 100% adaptado a mi marca (voz, oferta, audiencia).\n` +
        `El oyente escucha el hook idéntico al viral, luego el puente lo lleva a mi propuesta. Eso es todo.`;

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
        const id = saveAdaptedScript(userId, videoId, format, out, model);
        generatedIds.push(id);
      }
    } catch (e) {
      console.warn(`[comp-gen] generación video ${videoId} (${format}):`, (e as Error).message);
    }
  }

  return { ok: true, generated: generatedIds.length };
}

// ─── Pipeline masivo: analizar y adaptar TODOS los videos en estado 'analysing' ──

export async function processAnalysingVideos(limit = 3): Promise<{ processed: number; errors: number }> {
  const rows = db
    .prepare(
      `SELECT cv.id, ca.user_id
       FROM competitor_videos cv
       JOIN competitor_accounts ca ON ca.id = cv.account_id
       WHERE cv.status = 'analysing'
       ORDER BY cv.fetched_at ASC
       LIMIT ?`
    )
    .all(limit) as { id: number; user_id: number }[];

  let processed = 0, errors = 0;
  for (const { id, user_id } of rows) {
    const r = await analyseAndAdapt(user_id, id);
    if (r.ok) processed++;
    else errors++;
  }
  return { processed, errors };
}
