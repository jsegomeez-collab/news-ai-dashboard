import { db } from "./db";
import { env } from "./env";
import { client, recordUsage, firstText, parseJsonFromText } from "./anthropic";
import { getRelevanceThreshold } from "./settings";

type ArticleRow = {
  id: number;
  source: string;
  title: string;
  summary: string | null;
  url: string;
};

export type ClassResult = {
  relevance: number; // 0-100
  category: string;
  business_angle: string;
  actuality_link: string;
};

const SCHEMA = {
  type: "object",
  properties: {
    relevance: {
      type: "integer",
      description:
        "0-100: encaje con los TRES PILARES (ver instrucciones). 100 = oro absoluto; <55 = fuera de tema (no se mostrará).",
    },
    pillar: {
      type: "string",
      description:
        "Pilar dominante: 'negocio-digital' (IA aplicada a negocios/marketing/ventas/infoproductos), 'solucion-innovadora' (herramienta/uso de IA novedoso y útil), 'novedad' (lanzamiento/modelo/feature muy reciente), o 'ninguno'.",
    },
    novelty: {
      type: "integer",
      description: "0-100: cómo de NUEVO/reciente es (lanzamiento o cambio fresco vs. recap u opinión vieja).",
    },
    category: {
      type: "string",
      description:
        "Categoría corta: 'claude/anthropic', 'modelos-ia', 'herramientas', 'marketing-ia', 'negocio-ia', 'regulacion', 'otro'.",
    },
    business_angle: {
      type: "string",
      description:
        "Una frase: el ángulo de negocio/oportunidad concreto para emprendedores o empresas digitales. Si no lo hay, ''.",
    },
    actuality_link: {
      type: "string",
      description:
        "Una frase conectando con actualidad o tendencias (economía, política tipo Trump, cultura) si aplica; si no, ''.",
    },
  },
  required: ["relevance", "pillar", "novelty", "category", "business_angle", "actuality_link"],
  additionalProperties: false,
} as const;

const SYSTEM =
  "Eres el editor jefe de una marca de IA aplicada a NEGOCIOS DIGITALES (infoproductos, marketing, ventas, automatización y soluciones de IA para empresas y emprendedores), con foco en Claude/Anthropic y el ecosistema de IA. " +
  "Eres MUY selectivo: solo te interesan noticias que encajen en al menos uno de estos TRES PILARES:\n" +
  "1) IA aplicada a NEGOCIOS DIGITALES (cómo ganar dinero, vender, automatizar o crecer con IA).\n" +
  "2) SOLUCIONES DE IA INNOVADORAS (herramientas, modelos o usos nuevos y prácticos que dan ventaja).\n" +
  "3) NOVEDADES MUY RECIENTES (lanzamientos, nuevos modelos, features o cambios de última hora).\n\n" +
  "RÚBRICA DE RELEVANCE (0-100):\n" +
  "- 85-100: encaje fuerte con el pilar 1, o lanzamiento/feature muy nuevo y relevante para negocio.\n" +
  "- 70-84: claramente útil para contenido de IA+negocio o solución innovadora aplicable.\n" +
  "- 55-69: relacionado con IA pero ángulo de negocio flojo o poco nuevo.\n" +
  "- 0-54: FUERA DE TEMA. Puntúa AQUÍ sin piedad: política pura, reseñas de hardware/gadgets, " +
  "opinión genérica, papers académicos sin aplicación de negocio, recaps viejos, drama/cotilleo, o IA solo de pasada.\n\n" +
  "No infles la nota. Ante la duda, puntúa bajo. Devuelve SOLO JSON válido según el esquema.";

function buildUserPrompt(a: ArticleRow): string {
  return (
    `Fuente: ${a.source}\nTitular: ${a.title}\n` +
    `Resumen: ${(a.summary || "").slice(0, 800)}\nURL: ${a.url}\n\n` +
    `Clasifica esta noticia.`
  );
}

function pendingArticles(limit = 40): ArticleRow[] {
  return db
    .prepare(
      `SELECT a.id, a.source, a.title, a.summary, a.url
       FROM articles a
       LEFT JOIN classifications c ON c.article_id = a.id
       WHERE c.article_id IS NULL
       ORDER BY a.fetched_at DESC
       LIMIT ?`
    )
    .all(limit) as ArticleRow[];
}

function saveClassification(articleId: number, r: ClassResult, model: string): void {
  db.prepare(
    `INSERT INTO classifications(article_id, relevance, category, business_angle, actuality_link, model, created_at)
     VALUES(?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(article_id) DO UPDATE SET
       relevance=excluded.relevance, category=excluded.category,
       business_angle=excluded.business_angle, actuality_link=excluded.actuality_link,
       model=excluded.model, created_at=excluded.created_at`
  ).run(
    articleId,
    Math.max(0, Math.min(100, Math.round(r.relevance))),
    r.category,
    r.business_angle,
    r.actuality_link,
    model,
    new Date().toISOString()
  );

  // Encolar para generación si supera el umbral.
  if (r.relevance >= getRelevanceThreshold()) {
    db.prepare(
      `INSERT OR IGNORE INTO gen_queue(article_id, enqueued_at, done) VALUES(?, ?, 0)`
    ).run(articleId, new Date().toISOString());
  }
}

// ---- Modo síncrono (rápido, sin descuento de batch) ----
async function classifySync(articles: ArticleRow[]): Promise<number> {
  let done = 0;
  for (const a of articles) {
    try {
      const msg = await client().messages.create({
        model: env.modelClassify,
        max_tokens: 400,
        system: SYSTEM,
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
        messages: [{ role: "user", content: buildUserPrompt(a) }],
      } as never);
      recordUsage(env.modelClassify, (msg as never as { usage: never }).usage);
      const parsed = parseJsonFromText<ClassResult>(firstText(msg as never));
      if (parsed) {
        saveClassification(a.id, parsed, env.modelClassify);
        done++;
      }
    } catch (e) {
      console.warn(`[classify] error art ${a.id}:`, (e as Error).message);
    }
  }
  return done;
}

// ---- Modo batch (50% más barato, async) ----
async function classifyBatch(articles: ArticleRow[]): Promise<void> {
  const requests = articles.map((a) => ({
    custom_id: `art-${a.id}`,
    params: {
      model: env.modelClassify,
      max_tokens: 400,
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: buildUserPrompt(a) }],
    },
  }));
  const batch = await client().messages.batches.create({ requests } as never);
  db.prepare(
    `INSERT OR IGNORE INTO classify_batches(batch_id, created_at, status) VALUES(?, ?, 'in_progress')`
  ).run((batch as never as { id: string }).id, new Date().toISOString());
  console.log(`[classify] batch creado: ${(batch as never as { id: string }).id} (${articles.length} artículos)`);
}

// Punto de entrada: clasifica lo pendiente (batch o sync según config).
export async function classifyPending(): Promise<{ mode: string; count: number }> {
  const articles = pendingArticles();
  if (articles.length === 0) return { mode: "none", count: 0 };

  if (env.useBatchClassify) {
    await classifyBatch(articles);
    return { mode: "batch", count: articles.length };
  }
  const done = await classifySync(articles);
  return { mode: "sync", count: done };
}

// Revisa los batches en curso y, si han terminado, guarda los resultados.
export async function pollClassifyBatches(): Promise<number> {
  const open = db
    .prepare(`SELECT batch_id FROM classify_batches WHERE status = 'in_progress'`)
    .all() as { batch_id: string }[];
  let processed = 0;

  for (const { batch_id } of open) {
    try {
      const info = (await client().messages.batches.retrieve(batch_id)) as never as {
        processing_status: string;
      };
      if (info.processing_status !== "ended") continue;

      const results = await client().messages.batches.results(batch_id);
      for await (const result of results as never as AsyncIterable<{
        custom_id: string;
        result: { type: string; message?: { content: unknown[]; usage: never } };
      }>) {
        if (result.result.type !== "succeeded" || !result.result.message) continue;
        const articleId = Number(result.custom_id.replace("art-", ""));
        const msg = result.result.message as never as {
          content: { type: string; text?: string }[];
          usage: never;
        };
        recordUsage(env.modelClassify, msg.usage);
        const text = msg.content.find((b) => b.type === "text")?.text ?? "";
        const parsed = parseJsonFromText<ClassResult>(text);
        if (parsed) {
          saveClassification(articleId, parsed, env.modelClassify);
          processed++;
        }
      }
      db.prepare(`UPDATE classify_batches SET status = 'done' WHERE batch_id = ?`).run(batch_id);
      console.log(`[classify] batch ${batch_id} procesado (${processed} resultados)`);
    } catch (e) {
      console.warn(`[classify] error en batch ${batch_id}:`, (e as Error).message);
    }
  }
  return processed;
}
