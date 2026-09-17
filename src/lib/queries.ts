import { db } from "./db";

export type NewsItem = {
  id: number;
  source: string;
  url: string;
  title: string;
  summary: string | null;
  published_at: string | null;
  fetched_at: string;
  relevance: number | null;
  category: string | null;
  business_angle: string | null;
  actuality_link: string | null;
};

export function listNews(
  userId: number,
  opts: { minRelevance?: number; limit?: number; offset?: number } = {}
): NewsItem[] {
  const min = opts.minRelevance ?? 0;
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  return db
    .prepare(
      `SELECT a.id, a.source, a.url, a.title, a.summary, a.published_at, a.fetched_at,
              c.relevance, c.category, c.business_angle, c.actuality_link
       FROM articles a
       LEFT JOIN classifications c ON c.article_id = a.id AND c.user_id = ?
       WHERE c.relevance IS NULL OR c.relevance >= ?
       ORDER BY (c.relevance IS NULL), c.relevance DESC, a.fetched_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(userId, min, limit, offset) as NewsItem[];
}

export function countNews(userId: number, minRelevance = 0): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) n
         FROM articles a
         LEFT JOIN classifications c ON c.article_id = a.id AND c.user_id = ?
         WHERE c.relevance IS NULL OR c.relevance >= ?`
      )
      .get(userId, minRelevance) as { n: number }
  ).n;
}

export type ScriptItem = {
  id: number;
  article_id: number | null;
  format: string;
  title: string | null;
  hook: string | null;
  body: string | null;
  cta: string | null;
  status: string;
  created_at: string;
  article_title: string | null;
  article_url: string | null;
  score: number | null;
  tone_match: number | null;
  strengths: string | null;
  weaknesses: string | null;
  improvements: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  new_followers: number | null;
  published_at: string | null;
  notes: string | null;
};

export function listScripts(userId: number, opts: { minScore?: number; limit?: number } = {}): ScriptItem[] {
  const min = opts.minScore ?? 0;
  const limit = opts.limit ?? 300;
  return db
    .prepare(
      `SELECT s.id, s.article_id, s.format, s.title, s.hook, s.body, s.cta, s.status, s.created_at,
              a.title AS article_title, a.url AS article_url,
              cr.score, cr.tone_match, cr.strengths, cr.weaknesses, cr.improvements,
              m.views, m.likes, m.comments, m.shares, m.new_followers, m.published_at, m.notes
       FROM scripts s
       LEFT JOIN articles a ON a.id = s.article_id
       LEFT JOIN critiques cr ON cr.script_id = s.id
       LEFT JOIN script_metrics m ON m.script_id = s.id
       WHERE s.user_id = ? AND COALESCE(cr.score, 0) >= ?
       ORDER BY s.created_at DESC
       LIMIT ?`
    )
    .all(userId, min, limit) as ScriptItem[];
}

export function setScriptStatus(userId: number, id: number, status: string): void {
  db.prepare(`UPDATE scripts SET status = ? WHERE id = ? AND user_id = ?`).run(status, id, userId);
}

export type MetricsInput = {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  new_followers?: number;
  published_at?: string | null;
  notes?: string | null;
};

export function ownsScript(userId: number, scriptId: number): boolean {
  return !!db.prepare(`SELECT 1 FROM scripts WHERE id = ? AND user_id = ?`).get(scriptId, userId);
}

export function upsertMetrics(userId: number, scriptId: number, m: MetricsInput): boolean {
  if (!ownsScript(userId, scriptId)) return false;
  // Number.isFinite descarta NaN/Infinity (p.ej. un campo no numérico desde el
  // cliente), que si no se filtra aquí llega a SQLite como NULL y rompe el
  // NOT NULL de la columna con un 500 en vez de guardarse como 0.
  const n = (v: number | undefined) => {
    const num = Number(v);
    return Number.isFinite(num) ? Math.max(0, Math.round(num)) : 0;
  };
  db.prepare(
    `INSERT INTO script_metrics(script_id, views, likes, comments, shares, new_followers, published_at, notes, updated_at)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(script_id) DO UPDATE SET
       views=excluded.views, likes=excluded.likes, comments=excluded.comments,
       shares=excluded.shares, new_followers=excluded.new_followers,
       published_at=excluded.published_at, notes=excluded.notes, updated_at=excluded.updated_at`
  ).run(
    scriptId,
    n(m.views),
    n(m.likes),
    n(m.comments),
    n(m.shares),
    n(m.new_followers),
    m.published_at ?? null,
    m.notes ?? null,
    new Date().toISOString()
  );
  return true;
}

export function stats(userId: number): {
  articles: number;
  classified: number;
  scripts: number;
  queuePending: number;
} {
  const one = (sql: string, ...args: unknown[]) =>
    (db.prepare(sql).get(...(args as never[])) as { n: number }).n;
  return {
    articles: one(`SELECT COUNT(*) n FROM articles`),
    classified: one(`SELECT COUNT(*) n FROM classifications WHERE user_id = ?`, userId),
    scripts: one(`SELECT COUNT(*) n FROM scripts WHERE user_id = ?`, userId),
    queuePending: one(`SELECT COUNT(*) n FROM gen_queue WHERE user_id = ? AND done = 0`, userId),
  };
}
