import { db } from "./db";
import { client, recordUsage, firstText, parseJsonFromText } from "./anthropic";
import { buildBrain } from "./brand";
import { getGenModel, getFormats } from "./settings";

type Format = "reel" | "youtube";

type ArticleCtx = {
  id: number;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  category: string | null;
  business_angle: string | null;
  actuality_link: string | null;
};

const SCRIPT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Título interno del guion (corto)." },
    hook: { type: "string", description: "Gancho de apertura (primeros 3 segundos)." },
    body: { type: "string", description: "Cuerpo del guion, listo para leer/grabar a cámara." },
    cta: { type: "string", description: "Llamada a la acción final alineada con la oferta." },
  },
  required: ["title", "hook", "body", "cta"],
  additionalProperties: false,
} as const;

type ScriptOut = { title: string; hook: string; body: string; cta: string };

const PERSONA =
  "Eres el Head of Content (director de contenido) de una marca personal de IA aplicada a NEGOCIOS digitales: " +
  "infoproductos, marketing, ventas y soluciones de IA para empresas. Escribes guiones para que el creador llegue y GRABE, sin retoques. " +
  "Reglas: usa SIEMPRE su tonalidad y forma de hablar (de la sección TONALIDAD). Conecta la noticia con sus BASES DE NEGOCIO " +
  "(problema, cliente ideal, oferta) para que el contenido empuje hacia su oferta sin sonar a venta forzada. " +
  "El análisis de competencia es contexto secundario. Nada de relleno ni lenguaje de IA genérico. Devuelve SOLO JSON válido.";

function formatBrief(format: Format): string {
  if (format === "reel") {
    return (
      "FORMATO: VIDEO CORTO (Reel/TikTok/Short), 30-90 segundos hablados. " +
      "Gancho potente en los primeros 3 segundos, desarrollo ágil con UNA idea central, ritmo de frases cortas, " +
      "y CTA final claro. El 'body' debe ser texto hablado natural, no bullets."
    );
  }
  return (
    "FORMATO: YOUTUBE LARGO (5-10 min). Estructura: gancho, contexto/por qué importa, desarrollo en 2-4 puntos, " +
    "ejemplo práctico aplicado a negocio, y cierre con CTA. El 'body' debe incluir las secciones marcadas y ser " +
    "guion hablado listo para grabar."
  );
}

function getArticle(articleId: number): ArticleCtx | null {
  return (
    (db
      .prepare(
        `SELECT a.id, a.title, a.summary, a.url, a.source,
                c.category, c.business_angle, c.actuality_link
         FROM articles a LEFT JOIN classifications c ON c.article_id = a.id
         WHERE a.id = ?`
      )
      .get(articleId) as ArticleCtx | undefined) ?? null
  );
}

export async function generateForArticle(
  articleId: number,
  formats?: Format[]
): Promise<number[]> {
  const article = getArticle(articleId);
  if (!article) return [];
  const brain = await buildBrain();
  const model = getGenModel();
  const useFormats = formats ?? getFormats();

  // System estable (mismo prefijo en todas las generaciones) → caché reutilizable.
  const system = [
    { type: "text" as const, text: PERSONA },
    {
      type: "text" as const,
      text: `--- CEREBRO DE MARCA (úsalo para todo) ---\n${brain.combined}`,
      cache_control: { type: "ephemeral" as const },
    },
  ];

  const createdIds: number[] = [];
  for (const format of useFormats) {
    const userPrompt =
      `${formatBrief(format)}\n\n` +
      `--- NOTICIA ---\nFuente: ${article.source}\nTitular: ${article.title}\n` +
      `Resumen: ${(article.summary || "").slice(0, 1000)}\nURL: ${article.url}\n` +
      `Categoría: ${article.category ?? "-"}\nÁngulo de negocio: ${article.business_angle ?? "-"}\n` +
      `Conexión con actualidad: ${article.actuality_link ?? "-"}\n\n` +
      `Escribe el mejor guion posible para este formato.`;

    try {
      const msg = await client().messages.create({
        model,
        max_tokens: format === "youtube" ? 8000 : 1500,
        system,
        output_config: { format: { type: "json_schema", schema: SCRIPT_SCHEMA } },
        messages: [{ role: "user", content: userPrompt }],
      } as never);
      recordUsage(model, (msg as never as { usage: never }).usage, 1);

      const out = parseJsonFromText<ScriptOut>(firstText(msg as never));
      if (!out) continue;

      const res = db
        .prepare(
          `INSERT INTO scripts(article_id, format, title, hook, body, cta, status, model, created_at)
           VALUES(?, ?, ?, ?, ?, ?, 'borrador', ?, ?)`
        )
        .run(
          article.id,
          format,
          out.title,
          out.hook,
          out.body,
          out.cta,
          model,
          new Date().toISOString()
        );
      createdIds.push(Number(res.lastInsertRowid));
    } catch (e) {
      console.warn(`[generate] error art ${articleId} (${format}):`, (e as Error).message);
    }
  }
  return createdIds;
}
