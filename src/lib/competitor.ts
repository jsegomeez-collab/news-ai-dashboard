import { db } from "./db";

export type CompetitorAccount = {
  id: number;
  user_id: number;
  platform: string;
  handle: string;
  url: string;
  display_name: string | null;
  active: number;
  min_views: number;
  min_likes: number;
  min_comments: number;
  check_interval_hours: number;
  last_checked_at: string | null;
  created_at: string;
  video_count: number;
};

export type CompetitorVideo = {
  id: number;
  account_id: number;
  video_url: string;
  video_id: string | null;
  title: string | null;
  description: string | null;
  thumbnail_url: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  duration_sec: number | null;
  published_at: string | null;
  fetched_at: string;
  status: string;
  error_msg: string | null;
  // joined
  account_handle: string;
  account_platform: string;
  account_display_name: string | null;
  // analysis
  hook: string | null;
  hook_type: string | null;
  winning_idea: string | null;
  why_it_works: string | null;
  content_structure: string | null;
  viral_score: number | null;
  // transcript
  transcript: string | null;
  script_count: number;
};

export type CompetitorScriptItem = {
  id: number;
  video_id: number;
  user_id: number;
  format: string;
  title: string | null;
  hook: string | null;
  puente: string | null;
  body: string | null;
  cta: string | null;
  adaptation_notes: string | null;
  status: string;
  model: string | null;
  created_at: string;
  // joined
  video_url: string;
  video_title: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  account_handle: string;
  account_platform: string;
  original_hook: string | null;
  viral_score: number | null;
};

// ─── Accounts ────────────────────────────────────────────────────────────────

export function listAccounts(userId: number): CompetitorAccount[] {
  return db
    .prepare(
      `SELECT ca.*, COUNT(cv.id) as video_count
       FROM competitor_accounts ca
       LEFT JOIN competitor_videos cv ON cv.account_id = ca.id
       WHERE ca.user_id = ?
       GROUP BY ca.id
       ORDER BY ca.created_at DESC`
    )
    .all(userId) as CompetitorAccount[];
}

export function getAccount(userId: number, accountId: number): CompetitorAccount | null {
  return (db
    .prepare(`SELECT * FROM competitor_accounts WHERE id = ? AND user_id = ?`)
    .get(accountId, userId) as CompetitorAccount | undefined) ?? null;
}

export function createAccount(
  userId: number,
  data: {
    platform: string;
    handle: string;
    url: string;
    display_name?: string;
    min_views?: number;
    min_likes?: number;
    min_comments?: number;
    check_interval_hours?: number;
  }
): number {
  const res = db
    .prepare(
      `INSERT INTO competitor_accounts(user_id, platform, handle, url, display_name, min_views, min_likes, min_comments, check_interval_hours, created_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      data.platform,
      data.handle.replace(/^@/, "").toLowerCase().trim(),
      data.url.trim(),
      data.display_name?.trim() ?? null,
      Math.max(0, data.min_views ?? 50000),
      Math.max(0, data.min_likes ?? 0),
      Math.max(0, data.min_comments ?? 300),
      Math.max(1, data.check_interval_hours ?? 6),
      new Date().toISOString()
    );
  return Number(res.lastInsertRowid);
}

export function updateAccount(
  userId: number,
  accountId: number,
  data: {
    active?: boolean;
    display_name?: string;
    min_views?: number;
    min_likes?: number;
    min_comments?: number;
    check_interval_hours?: number;
  }
): void {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.active !== undefined) { fields.push("active = ?"); values.push(data.active ? 1 : 0); }
  if (data.display_name !== undefined) { fields.push("display_name = ?"); values.push(data.display_name.trim()); }
  if (data.min_views !== undefined) { fields.push("min_views = ?"); values.push(Math.max(0, data.min_views)); }
  if (data.min_likes !== undefined) { fields.push("min_likes = ?"); values.push(Math.max(0, data.min_likes)); }
  if (data.min_comments !== undefined) { fields.push("min_comments = ?"); values.push(Math.max(0, data.min_comments)); }
  if (data.check_interval_hours !== undefined) { fields.push("check_interval_hours = ?"); values.push(Math.max(1, data.check_interval_hours)); }
  if (fields.length === 0) return;
  values.push(accountId, userId);
  db.prepare(`UPDATE competitor_accounts SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).run(...(values as never[]));
}

export function deleteAccount(userId: number, accountId: number): void {
  db.prepare(`DELETE FROM competitor_accounts WHERE id = ? AND user_id = ?`).run(accountId, userId);
}

// ─── Videos ──────────────────────────────────────────────────────────────────

export function listVideos(
  userId: number,
  opts: { accountId?: number; status?: string; limit?: number; offset?: number } = {}
): CompetitorVideo[] {
  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 0;
  const extraWheres: string[] = [];
  const extraParams: unknown[] = [];

  if (opts.accountId !== undefined) { extraWheres.push("cv.account_id = ?"); extraParams.push(opts.accountId); }
  if (opts.status) { extraWheres.push("cv.status = ?"); extraParams.push(opts.status); }

  const whereClause = ["ca.user_id = ?", ...extraWheres].join(" AND ");
  const allParams: unknown[] = [userId, userId, ...extraParams, limit, offset];

  return db
    .prepare(
      `SELECT cv.*,
              ca.handle as account_handle, ca.platform as account_platform, ca.display_name as account_display_name,
              an.hook, an.hook_type, an.winning_idea, an.why_it_works, an.content_structure, an.viral_score,
              tr.text as transcript,
              (SELECT COUNT(*) FROM competitor_scripts cs WHERE cs.video_id = cv.id AND cs.user_id = ?) as script_count
       FROM competitor_videos cv
       JOIN competitor_accounts ca ON ca.id = cv.account_id
       LEFT JOIN competitor_analyses an ON an.video_id = cv.id
       LEFT JOIN competitor_transcripts tr ON tr.video_id = cv.id
       WHERE ${whereClause}
       ORDER BY cv.fetched_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...(allParams as never[])) as CompetitorVideo[];
}

export function countVideos(userId: number, opts: { accountId?: number; status?: string } = {}): number {
  const extraWheres: string[] = [];
  const extraParams: unknown[] = [];
  if (opts.accountId !== undefined) { extraWheres.push("cv.account_id = ?"); extraParams.push(opts.accountId); }
  if (opts.status) { extraWheres.push("cv.status = ?"); extraParams.push(opts.status); }
  const whereClause = ["ca.user_id = ?", ...extraWheres].join(" AND ");
  return (
    db
      .prepare(
        `SELECT COUNT(*) as n FROM competitor_videos cv
         JOIN competitor_accounts ca ON ca.id = cv.account_id
         WHERE ${whereClause}`
      )
      .get(userId, ...(extraParams as never[])) as { n: number }
  ).n;
}

// Recuento por status (sobre TODOS los videos de la cuenta filtrada, no solo
// la página actual) — para que botones como "Transcribir todos (N)" muestren
// el total real aunque la lista visible esté paginada a 20 por página.
export function videoStatusCounts(userId: number, accountId?: number): Record<string, number> {
  const scope = accountId !== undefined ? ` AND cv.account_id = ?` : ``;
  const params = accountId !== undefined ? [userId, accountId] : [userId];
  const rows = db
    .prepare(
      `SELECT cv.status, COUNT(*) as n FROM competitor_videos cv
       JOIN competitor_accounts ca ON ca.id = cv.account_id
       WHERE ca.user_id = ?${scope}
       GROUP BY cv.status`
    )
    .all(...(params as never[])) as { status: string; n: number }[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = r.n;
  return out;
}

export function getVideo(userId: number, videoId: number): CompetitorVideo | null {
  return (db
    .prepare(
      `SELECT cv.*,
              ca.handle as account_handle, ca.platform as account_platform, ca.display_name as account_display_name,
              an.hook, an.hook_type, an.winning_idea, an.why_it_works, an.content_structure, an.viral_score,
              tr.text as transcript,
              (SELECT COUNT(*) FROM competitor_scripts cs WHERE cs.video_id = cv.id AND cs.user_id = ?) as script_count
       FROM competitor_videos cv
       JOIN competitor_accounts ca ON ca.id = cv.account_id
       LEFT JOIN competitor_analyses an ON an.video_id = cv.id
       LEFT JOIN competitor_transcripts tr ON tr.video_id = cv.id
       WHERE cv.id = ? AND ca.user_id = ?`
    )
    .get(userId, videoId, userId) as CompetitorVideo | undefined) ?? null;
}

export function insertVideo(
  accountId: number,
  data: {
    video_url: string;
    video_id?: string;
    title?: string;
    description?: string;
    thumbnail_url?: string;
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    duration_sec?: number;
    published_at?: string;
    media_url?: string;
  }
): number | null {
  try {
    const res = db
      .prepare(
        `INSERT OR IGNORE INTO competitor_videos(account_id, video_url, video_id, title, description, thumbnail_url,
          views, likes, comments, shares, duration_sec, published_at, media_url, fetched_at, status)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
      )
      .run(
        accountId,
        data.video_url,
        data.video_id ?? null,
        data.title ?? null,
        data.description ?? null,
        data.thumbnail_url ?? null,
        data.views ?? null,
        data.likes ?? null,
        data.comments ?? null,
        data.shares ?? null,
        data.duration_sec ?? null,
        data.published_at ?? null,
        data.media_url ?? null,
        new Date().toISOString()
      );
    return res.changes > 0 ? Number(res.lastInsertRowid) : null;
  } catch (e) {
    // INSERT OR IGNORE no lanza por duplicados (solo devuelve changes=0, ya
    // gestionado arriba) — si esto salta es un fallo real (constraint, disco,
    // tipo de dato) que antes se tragaba en silencio como si fuera un duplicado más.
    console.warn(`[competitor] insertVideo falló para ${data.video_url}:`, (e as Error).message);
    return null;
  }
}

export function setVideoStatus(videoId: number, status: string, errorMsg?: string): void {
  db.prepare(`UPDATE competitor_videos SET status = ?, error_msg = ? WHERE id = ?`).run(status, errorMsg ?? null, videoId);
}

export function saveTranscript(videoId: number, text: string, language: string, model: string): void {
  db.prepare(
    `INSERT INTO competitor_transcripts(video_id, text, language, model, created_at)
     VALUES(?, ?, ?, ?, ?)
     ON CONFLICT(video_id) DO UPDATE SET text=excluded.text, language=excluded.language, model=excluded.model, created_at=excluded.created_at`
  ).run(videoId, text, language, model, new Date().toISOString());
}

export function saveAnalysis(videoId: number, analysis: {
  hook?: string;
  hook_type?: string;
  winning_idea?: string;
  curiosity_gap?: string;
  viral_pattern?: string;
  why_it_works?: string;
  content_structure?: string;
  viral_score?: number;
  model: string;
}): void {
  db.prepare(
    `INSERT INTO competitor_analyses(video_id, hook, hook_type, winning_idea, curiosity_gap, viral_pattern, why_it_works, content_structure, viral_score, model, created_at)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(video_id) DO UPDATE SET
       hook=excluded.hook, hook_type=excluded.hook_type, winning_idea=excluded.winning_idea,
       curiosity_gap=excluded.curiosity_gap, viral_pattern=excluded.viral_pattern,
       why_it_works=excluded.why_it_works, content_structure=excluded.content_structure,
       viral_score=excluded.viral_score, model=excluded.model, created_at=excluded.created_at`
  ).run(
    videoId,
    analysis.hook ?? null, analysis.hook_type ?? null, analysis.winning_idea ?? null,
    analysis.curiosity_gap ?? null, analysis.viral_pattern ?? null,
    analysis.why_it_works ?? null, analysis.content_structure ?? null,
    analysis.viral_score ?? null, analysis.model,
    new Date().toISOString()
  );
}

export function saveAdaptedScript(
  userId: number,
  videoId: number,
  format: string,
  out: { title: string; hook: string; puente?: string; body: string; cta: string; adaptation_notes?: string },
  model: string
): number {
  const res = db
    .prepare(
      `INSERT INTO competitor_scripts(video_id, user_id, format, title, hook, puente, body, cta, adaptation_notes, status, model, created_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'borrador', ?, ?)`
    )
    .run(videoId, userId, format, out.title, out.hook, out.puente ?? null, out.body, out.cta, out.adaptation_notes ?? null, model, new Date().toISOString());
  return Number(res.lastInsertRowid);
}

// ─── Adapted scripts ──────────────────────────────────────────────────────────

export function listAdaptedScripts(userId: number, limit = 100): CompetitorScriptItem[] {
  return db
    .prepare(
      `SELECT cs.id, cs.video_id, cs.user_id, cs.format, cs.title, cs.hook, cs.puente, cs.body, cs.cta, cs.adaptation_notes, cs.status, cs.model, cs.created_at,
              cv.video_url, cv.title as video_title, cv.views, cv.likes, cv.comments,
              ca.handle as account_handle, ca.platform as account_platform,
              an.hook as original_hook, an.viral_score
       FROM competitor_scripts cs
       JOIN competitor_videos cv ON cv.id = cs.video_id
       JOIN competitor_accounts ca ON ca.id = cv.account_id
       LEFT JOIN competitor_analyses an ON an.video_id = cv.id
       WHERE cs.user_id = ?
       ORDER BY cs.created_at DESC
       LIMIT ?`
    )
    .all(userId, limit) as CompetitorScriptItem[];
}

export function updateCompetitorScriptStatus(userId: number, scriptId: number, status: string): void {
  db.prepare(`UPDATE competitor_scripts SET status = ? WHERE id = ? AND user_id = ?`).run(status, scriptId, userId);
}

// ─── Accounts que toca comprobar ahora ────────────────────────────────────────

// Sin userId: TODAS las cuentas debidas de TODOS los usuarios (uso del worker
// de fondo, que sí debe barrer a todo el mundo). Con userId: solo las de ese
// usuario (uso de los endpoints HTTP, para no procesar cuentas ajenas como
// efecto colateral de que un usuario pulse "revisar ahora").
export function accountsDue(userId?: number): { id: number; user_id: number; platform: string; handle: string; url: string; check_interval_hours: number; min_views: number; min_likes: number; min_comments: number }[] {
  const scope = userId !== undefined ? ` AND user_id = ?` : ``;
  const params = userId !== undefined ? [userId] : [];
  return db
    .prepare(
      `SELECT id, user_id, platform, handle, url, check_interval_hours, min_views, min_likes, min_comments
       FROM competitor_accounts
       WHERE active = 1
         AND (last_checked_at IS NULL
           OR datetime(last_checked_at, '+' || check_interval_hours || ' hours') <= datetime('now'))
         ${scope}`
    )
    .all(...(params as never[])) as never[];
}

export function markAccountChecked(accountId: number): void {
  db.prepare(`UPDATE competitor_accounts SET last_checked_at = ? WHERE id = ?`).run(new Date().toISOString(), accountId);
}

// ─── Pending videos (para el worker) ─────────────────────────────────────────

export function pendingVideos(): { id: number; video_url: string; account_id: number }[] {
  return db
    .prepare(`SELECT id, video_url, account_id FROM competitor_videos WHERE status = 'pending' LIMIT 20`)
    .all() as { id: number; video_url: string; account_id: number }[];
}

// Videos pendientes de transcribir con el user_id del propietario de la cuenta.
// Incluye plataforma y media_url para que el transcriptor elija la vía correcta
// (Instagram → mp4 directo vía fetch; YouTube/TikTok → yt-dlp).
export type PendingVideo = {
  id: number;
  video_url: string;
  user_id: number;
  platform: string;
  media_url: string | null;
};

// Sin userId: pendientes de TODOS los usuarios (worker de fondo). Con userId:
// solo los de ese usuario (para que un endpoint HTTP por-usuario, como
// /api/competitors/run, no transcriba/gaste presupuesto de otros usuarios).
export function pendingVideosWithUser(limit = 5, userId?: number): PendingVideo[] {
  const scope = userId !== undefined ? ` AND ca.user_id = ?` : ``;
  const params = userId !== undefined ? [userId, limit] : [limit];
  return db
    .prepare(
      `SELECT cv.id, cv.video_url, cv.media_url, ca.user_id, ca.platform
       FROM competitor_videos cv
       JOIN competitor_accounts ca ON ca.id = cv.account_id
       WHERE cv.status = 'pending'${scope}
       ORDER BY cv.fetched_at ASC
       LIMIT ?`
    )
    .all(...(params as never[])) as PendingVideo[];
}

// Un único video por id, acotado al usuario dueño de la cuenta — sin importar
// su status (a diferencia de pendingVideosWithUser, que solo ve 'pending').
// Usado por el botón manual de transcripción/reintento en la UI.
export function pendingVideoById(userId: number, videoId: number): PendingVideo | null {
  return (
    (db
      .prepare(
        `SELECT cv.id, cv.video_url, cv.media_url, ca.user_id, ca.platform
         FROM competitor_videos cv
         JOIN competitor_accounts ca ON ca.id = cv.account_id
         WHERE cv.id = ? AND ca.user_id = ?`
      )
      .get(videoId, userId) as PendingVideo | undefined) ?? null
  );
}

// ─── Limpieza automática ───────────────────────────────────────────────────────

const STALE_TRANSCRIBED_DAYS = 60;

// Un video ya transcrito (tiene fila en competitor_transcripts) que lleva
// STALE_TRANSCRIBED_DAYS+ sin terminar de analizarse (atascado en 'analysing'
// o fallido en 'error' tras la transcripción) se descarta para no acumular
// contenido muerto sin límite. Los videos 'done' (analizados) nunca se tocan.
export function pruneStaleTranscribedVideos(): number {
  const cutoff = new Date(Date.now() - STALE_TRANSCRIBED_DAYS * 86400_000).toISOString();
  const res = db
    .prepare(
      `DELETE FROM competitor_videos
       WHERE status != 'done'
         AND id IN (SELECT video_id FROM competitor_transcripts WHERE created_at < ?)`
    )
    .run(cutoff);
  return Number(res.changes);
}
