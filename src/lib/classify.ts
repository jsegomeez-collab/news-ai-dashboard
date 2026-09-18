import { db } from "./db";
import { env } from "./env";
import { client, recordUsage, firstText, parseJsonFromText } from "./anthropic";
import { readUserSettings } from "./settings";

type ArticleRow = {
  id: number;
  source: string;
  title: string;
  summary: string | null;
  url: string;
};

export type ClassResult = {
  relevance: number;
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
        "0-100: encaje con los TRES PILARES (ver instrucciones). 100 = oro absoluto; <55 = fuera de tema.",
    },
    pillar: {
      type: "string",
      description:
        "Pilar dominante: 'negocio-digital', 'solucion-innovadora', 'novedad' o 'ninguno'.",
    },
    novelty: { type: "integer", description: "0-100: cómo de NUEVO/reciente es." },
    category: {
      type: "string",
      description: "Categoría corta: 'claude/anthropic','modelos-ia','herramientas','marketing-ia','negocio-ia','regulacion','otro'.",
    },
    business_angle: { type: "string", description: "Una frase: el ángulo de negocio. Si no hay, ''." },
    actuality_link: { type: "string", description: "Una frase conectando con actualidad si aplica; si no, ''." },
  },
  required: ["relevance", "pillar", "novelty", "category", "business_angle", "actuality_link"],
  additionalProperties: false,
} as const;

const SYSTEM =
  "Eres el editor jefe de una marca de IA aplicada a NEGOCIOS DIGITALES (infoproductos, marketing, ventas, automatización y soluciones de IA para empresas), con foco en Claude/Anthropic y el ecosistema de IA. " +
  "Eres MUY selectivo: solo te interesan noticias que encajen en al menos uno de estos TRES PILARES:\n" +
  "1) IA aplicada a NEGOCIOS DIGITALES.\n2) SOLUCIONES DE IA INNOVADORAS.\n3) NOVEDADES MUY RECIENTES (lanzamientos, modelos, features).\n\n" +
  "RÚBRICA DE RELEVANCE (0-100): 85-100 encaje fuerte/lanzamiento muy nuevo; 70-84 claramente útil; 55-69 flojo; 0-54 FUERA DE TEMA " +
  "(política pura, reseñas de gadgets, opinión genérica, papers sin aplicación, recaps viejos, cotilleo). No infles la nota. Devuelve SOLO JSON válido.";

function buildUserPrompt(a: ArticleRow): string {
  return (
    `Fuente: ${a.source}\nTitular: ${a.title}\n` +
    `Resumen: ${(a.summary || "").slice(0, 800)}\nURL: ${a.url}\n\nClasifica esta noticia.`
  );
}

function pendingArticles(userId: number, limit = 60): ArticleRow[] {
  return db
    .prepare(
      `SELECT a.id, a.source, a.title, a.summary, a.url
       FROM articles a
       LEFT JOIN classifications c ON c.article_id = a.id AND c.user_id = ?
       WHERE c.article_id IS NULL
       ORDER BY a.fetched_at DESC
       LIMIT ?`
    )
    .all(userId, limit) as ArticleRow[];
}

function saveClassification(userId: number, articleId: number, articleTitle: string, r: ClassResult, model: string): void {
  db.prepare(
    `INSERT INTO classifications(user_id, article_id, relevance, category, business_angle, actuality_link, model, created_at)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, article_id) DO UPDATE SET
       relevance=excluded.relevance, category=excluded.category,
       business_angle=excluded.business_angle, actuality_link=excluded.actuality_link,
       model=excluded.model, created_at=excluded.created_at`
  ).run(
    userId,
    articleId,
    Math.max(0, Math.min(100, Math.round(r.relevance))),
    r.category,
    r.business_angle,
    r.actuality_link,
    model,
    new Date().toISOString()
  );

  const threshold = readUserSettings(userId).genRelevanceThreshold;
  if (r.relevance >= threshold && !isDuplicateStory(userId, articleTitle)) {
    db.prepare(
      `INSERT OR IGNORE INTO gen_queue(user_id, article_id, enqueued_at, done) VALUES(?, ?, ?, 0)`
    ).run(userId, articleId, new Date().toISOString());
  }
}

// Comprueba si ya hay un artículo del mismo story en cola o un guion generado hoy.
// Usa Jaccard sobre palabras clave (>3 chars, sin stopwords) del titular.
// Umbral 0.4 → captura "Claude Sonnet 5 lanzado" y "Anthropic lanza Claude Sonnet 5"
// sin bloquear historias distintas con palabras comunes como "inteligencia artificial".
const STOPWORDS = new Set([
  "para","como","este","esta","esto","estos","estas","cuando","donde","quien",
  "porque","aunque","desde","hasta","entre","sobre","también","pero","sino",
  "the","and","for","with","that","this","from","have","will","been","were",
  "they","their","what","which","into","more","than","also","after","about",
]);

function storyKeywords(title: string): Set<string> {
  return new Set(
    title.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && !STOPWORDS.has(w))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function isDuplicateStory(userId: number, title: string): boolean {
  const kw = storyKeywords(title);
  if (kw.size < 2) return false; // titular demasiado corto para comparar

  const recent = db.prepare(`
    SELECT a.title FROM articles a
    JOIN gen_queue gq ON gq.article_id = a.id
    WHERE gq.user_id = ? AND gq.done = 0
    UNION
    SELECT a.title FROM articles a
    JOIN scripts s ON s.article_id = a.id
    WHERE s.user_id = ? AND s.created_at >= datetime('now', '-20 hours')
  `).all(userId, userId) as { title: string }[];

  return recent.some((r) => jaccard(kw, storyKeywords(r.title)) >= 0.4);
}

// Una clave inválida/revocada falla IGUAL para el artículo 1 que para el 60 —
// sin esto, cada ciclo (cada 2h, para siempre hasta que alguien note el aviso
// y la corrija en Ajustes) volvía a intentar los ~60 pendientes de este
// usuario contra la misma clave rota, generando decenas de líneas de log
// inútiles por nada.
function isAuthError(e: unknown): boolean {
  const msg = (e as Error)?.message ?? "";
  return /authentication_error|invalid.*api.?key|api key is invalid/i.test(msg);
}

async function classifyArticle(userId: number, apiKey: string, a: ArticleRow): Promise<"ok" | "fail" | "auth-error"> {
  try {
    const msg = await client(apiKey).messages.create({
      model: env.modelClassify,
      max_tokens: 400,
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: buildUserPrompt(a) }],
    } as never);
    recordUsage(userId, env.modelClassify, (msg as never as { usage: never }).usage);
    const parsed = parseJsonFromText<ClassResult>(firstText(msg as never));
    if (parsed) {
      saveClassification(userId, a.id, a.title, parsed, env.modelClassify);
      return "ok";
    }
  } catch (e) {
    console.warn(`[classify] u${userId} art ${a.id}:`, (e as Error).message);
    if (isAuthError(e)) return "auth-error";
  }
  return "fail";
}

// Clasifica en paralelo con concurrencia limitada (rápido pero sin saturar la API).
// Si algún artículo revela que la clave es inválida, se deja de lanzar más
// para el resto del lote (los que ya estaban en vuelo con la misma clave
// rota igual fallan, pero no se arrancan más) — la próxima vez que corra el
// ciclo lo reintentará solo, así que en cuanto se corrija la clave en
// Ajustes, sigue funcionando sin tocar nada más.
async function classifySync(userId: number, apiKey: string, articles: ArticleRow[]): Promise<number> {
  const CONCURRENCY = 6;
  let done = 0;
  let i = 0;
  let authError = false;
  async function worker() {
    while (i < articles.length && !authError) {
      const a = articles[i++];
      const r = await classifyArticle(userId, apiKey, a);
      if (r === "ok") done++;
      else if (r === "auth-error") authError = true;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, articles.length) }, worker));
  if (authError) {
    console.warn(
      `[classify] u${userId}: clave de Anthropic inválida — se detiene el resto de este lote (revisa la clave en Ajustes)`
    );
  }
  return done;
}

async function classifyBatch(userId: number, apiKey: string, articles: ArticleRow[]): Promise<void> {
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
  const batch = await client(apiKey).messages.batches.create({ requests } as never);
  const id = (batch as never as { id: string }).id;
  db.prepare(
    `INSERT OR IGNORE INTO classify_batches(batch_id, user_id, created_at, status) VALUES(?, ?, ?, 'in_progress')`
  ).run(id, userId, new Date().toISOString());
  console.log(`[classify] u${userId} batch ${id} (${articles.length} arts)`);
}

// Clasifica lo pendiente de un usuario (batch o sync según config global).
export async function classifyPending(userId: number): Promise<{ mode: string; count: number }> {
  const s = readUserSettings(userId);
  if (!s.anthropicKey.startsWith("sk-ant-")) return { mode: "no-key", count: 0 };
  const articles = pendingArticles(userId);
  if (articles.length === 0) return { mode: "none", count: 0 };

  if (env.useBatchClassify) {
    await classifyBatch(userId, s.anthropicKey, articles);
    return { mode: "batch", count: articles.length };
  }
  const done = await classifySync(userId, s.anthropicKey, articles);
  return { mode: "sync", count: done };
}

// Revisa los batches en curso de un usuario y guarda los resultados terminados.
export async function pollClassifyBatches(userId: number): Promise<number> {
  const s = readUserSettings(userId);
  if (!s.anthropicKey.startsWith("sk-ant-")) return 0;
  const open = db
    .prepare(`SELECT batch_id FROM classify_batches WHERE status = 'in_progress' AND user_id = ?`)
    .all(userId) as { batch_id: string }[];
  let processed = 0;

  for (const { batch_id } of open) {
    try {
      const info = (await client(s.anthropicKey).messages.batches.retrieve(batch_id)) as never as {
        processing_status: string;
      };
      if (info.processing_status !== "ended") continue;

      const results = await client(s.anthropicKey).messages.batches.results(batch_id);
      for await (const result of results as never as AsyncIterable<{
        custom_id: string;
        result: { type: string; message?: { content: { type: string; text?: string }[]; usage: never } };
      }>) {
        if (result.result.type !== "succeeded" || !result.result.message) continue;
        const articleId = Number(result.custom_id.replace("art-", ""));
        const msg = result.result.message;
        recordUsage(userId, env.modelClassify, msg.usage);
        const text = msg.content.find((b) => b.type === "text")?.text ?? "";
        const parsed = parseJsonFromText<ClassResult>(text);
        if (parsed) {
          const art = db.prepare(`SELECT title FROM articles WHERE id = ?`).get(articleId) as { title: string } | undefined;
          saveClassification(userId, articleId, art?.title ?? "", parsed, env.modelClassify);
          processed++;
        }
      }
      db.prepare(`UPDATE classify_batches SET status = 'done' WHERE batch_id = ?`).run(batch_id);
    } catch (e) {
      console.warn(`[classify] u${userId} batch ${batch_id}:`, (e as Error).message);
    }
  }
  return processed;
}
