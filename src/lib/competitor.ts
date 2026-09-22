import { db } from "./db";
import { deleteUploadIfExists } from "./uploads";
import { todayUTC } from "./env";

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
  scan_limit: number;
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
  // audio/video subido por el usuario (su voz leyendo el guion, para el editor)
  media_path: string | null;
  media_original_name: string | null;
  media_mime: string | null;
  media_size: number | null;
  media_uploaded_at: string | null;
  // joined
  video_url: string;
  video_title: string | null;
  thumbnail_url: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  account_handle: string;
  account_platform: string;
  original_hook: string | null;
  viral_score: number | null;
};

// ─── Accounts ────────────────────────────────────────────────────────────────

// is_manual = 0: no lista la cuenta especial "enlaces sueltos" (ver
// getOrCreateManualAccount) — sus vídeos SÍ se ven en /competencia como
// cualquier otro, pero ella misma no es una cuenta que el usuario gestione
// (editar/pausar/borrar) como las que monitoriza de verdad.
export function listAccounts(userId: number): CompetitorAccount[] {
  return db
    .prepare(
      `SELECT ca.*, COUNT(cv.id) as video_count
       FROM competitor_accounts ca
       LEFT JOIN competitor_videos cv ON cv.account_id = ca.id
       WHERE ca.user_id = ? AND ca.is_manual = 0
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

// La URL del perfil se guarda tal cual y luego se pasa DIRECTAMENTE a yt-dlp
// (youtube/tiktok) como argumento — yt-dlp es un fetcher genérico de URLs, así
// que sin esto cualquiera podría dar de alta una "cuenta" con
// http://169.254.169.254/... o http://localhost:<puerto interno>/... y hacer
// que el worker de fondo la solicite server-side (SSRF). También evita que un
// esquema no-http (javascript:, data:...) acabe en un <a href> renderizado en
// /competencia (list_accounts se muestra tal cual, sin filtrar el esquema ahí).
const PLATFORM_HOSTS: Record<string, string[]> = {
  youtube: ["youtube.com", "youtu.be"],
  tiktok: ["tiktok.com"],
  instagram: ["instagram.com"],
};

export function isValidAccountUrl(platform: string, url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  const hosts = PLATFORM_HOSTS[platform];
  if (!hosts) return false;
  const hostname = parsed.hostname.toLowerCase();
  return hosts.some((h) => hostname === h || hostname.endsWith(`.${h}`));
}

// Detecta la plataforma de un enlace SUELTO de vídeo (un reel, un short, un
// tiktok concreto) por su dominio — mismo criterio (y misma lista de
// dominios) que isValidAccountUrl, pero sin exigir de antemano cuál de las
// tres plataformas es.
export function detectPlatformFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const hostname = parsed.hostname.toLowerCase();
  for (const [platform, hosts] of Object.entries(PLATFORM_HOSTS)) {
    if (hosts.some((h) => hostname === h || hostname.endsWith(`.${h}`))) return platform;
  }
  return null;
}

const MANUAL_ACCOUNT_HANDLE = "enlaces-sueltos";

// Cuenta especial (una por usuario y plataforma) que sostiene los vídeos
// añadidos pegando el enlace directo (ver addManualVideos) — no se
// monitoriza sola (active=0, así accountsDue() nunca la coge) y se excluye
// de la lista de cuentas en pantalla (ver listAccounts), pero sus vídeos
// entran al mismo pipeline de transcripción/adaptación que cualquier otro.
function getOrCreateManualAccount(userId: number, platform: string): number {
  const existing = db
    .prepare(`SELECT id FROM competitor_accounts WHERE user_id = ? AND platform = ? AND handle = ?`)
    .get(userId, platform, MANUAL_ACCOUNT_HANDLE) as { id: number } | undefined;
  if (existing) return existing.id;

  const res = db
    .prepare(
      `INSERT INTO competitor_accounts(user_id, platform, handle, url, display_name, active, is_manual, min_views, min_likes, min_comments, check_interval_hours, created_at)
       VALUES(?, ?, ?, ?, ?, 0, 1, 0, 0, 0, 999999, ?)`
    )
    .run(
      userId,
      platform,
      MANUAL_ACCOUNT_HANDLE,
      `https://${PLATFORM_HOSTS[platform][0]}`,
      "🔗 Enlaces añadidos a mano",
      new Date().toISOString()
    );
  return Number(res.lastInsertRowid);
}

// Añade uno o varios enlaces de vídeo sueltos (no hace falta que sean de una
// cuenta que ya monitorices) directamente a la cola de transcripción — sin
// pasar por Apify/yt-dlp para descubrirlos, porque ya sabes exactamente cuál
// quieres. No trae vistas/likes/comentarios (eso solo lo da el scrapeo de
// perfil), así que estos vídeos entran sin pasar el filtro de umbrales.
export function addManualVideos(userId: number, urls: string[]): { added: number; skipped: number; invalid: number } {
  let added = 0, skipped = 0, invalid = 0;
  for (const raw of urls) {
    const url = raw.trim();
    if (!url) continue;
    const platform = detectPlatformFromUrl(url);
    if (!platform) {
      invalid++;
      continue;
    }
    const accountId = getOrCreateManualAccount(userId, platform);
    const id = insertVideo(accountId, { video_url: url });
    if (id !== null) added++;
    else skipped++; // ya existía (mismo enlace pegado antes) u otro fallo de inserción
  }
  return { added, skipped, invalid };
}

// Cuenta para un escaneo PUNTUAL de un perfil (no una monitorización
// permanente): reutiliza la fila si ya existe una cuenta con ese
// (usuario, plataforma, handle) — sea una cuenta real que ya monitorizas o
// un escaneo puntual anterior del mismo perfil, para que UNIQUE(user_id,
// platform, handle) nunca choque y para que repetir el escaneo agrupe los
// vídeos bajo el mismo sitio en vez de crear una cuenta nueva cada vez. Si
// no existe ninguna, crea una is_manual=1/active=0 (nunca la recoge el
// scrapeo periódico ni aparece en "tus cuentas").
export function getOrCreateScanAccount(userId: number, platform: string, handle: string, url: string): number {
  const normalizedHandle = handle.replace(/^@/, "").toLowerCase().trim();
  const existing = db
    .prepare(`SELECT id FROM competitor_accounts WHERE user_id = ? AND platform = ? AND handle = ?`)
    .get(userId, platform, normalizedHandle) as { id: number } | undefined;
  if (existing) return existing.id;

  if (!isValidAccountUrl(platform, url)) {
    throw new Error(`URL inválida para ${platform}: debe ser un enlace http(s) real de esa plataforma`);
  }
  const res = db
    .prepare(
      `INSERT INTO competitor_accounts(user_id, platform, handle, url, display_name, active, is_manual, min_views, min_likes, min_comments, check_interval_hours, created_at)
       VALUES(?, ?, ?, ?, NULL, 0, 1, 0, 0, 0, 999999, ?)`
    )
    .run(userId, platform, normalizedHandle, url.trim(), new Date().toISOString());
  return Number(res.lastInsertRowid);
}

// Tope duro de cuántos vídeos recientes se piden a Apify/yt-dlp de una sentada
// — por encima de esto el actor de Apify tarda demasiado (su propio timeout
// son ~5min) o yt-dlp se pone lento innecesariamente. 100 es de sobra para
// cualquier perfil real; quien necesite más que eso probablemente quiere
// varios escaneos, no uno gigante.
export const MAX_SCAN_LIMIT = 100;

export function clampScanLimit(v: number | undefined, fallback = 20): number {
  return Math.max(1, Math.min(MAX_SCAN_LIMIT, Math.round(v ?? fallback) || fallback));
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
    scan_limit?: number;
    check_interval_hours?: number;
  }
): number {
  if (!isValidAccountUrl(data.platform, data.url)) {
    throw new Error(`URL inválida para ${data.platform}: debe ser un enlace http(s) real de esa plataforma`);
  }
  const res = db
    .prepare(
      `INSERT INTO competitor_accounts(user_id, platform, handle, url, display_name, min_views, min_likes, min_comments, scan_limit, check_interval_hours, created_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      clampScanLimit(data.scan_limit),
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
    scan_limit?: number;
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
  if (data.scan_limit !== undefined) { fields.push("scan_limit = ?"); values.push(clampScanLimit(data.scan_limit)); }
  if (data.check_interval_hours !== undefined) { fields.push("check_interval_hours = ?"); values.push(Math.max(1, data.check_interval_hours)); }
  if (fields.length === 0) return;
  values.push(accountId, userId);
  db.prepare(`UPDATE competitor_accounts SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).run(...(values as never[]));
}

export function deleteAccount(userId: number, accountId: number): void {
  // ON DELETE CASCADE se lleva por delante videos/transcripts/análisis/guiones,
  // pero NO los archivos de audio/video que el usuario subió a disco para esos
  // guiones — hay que borrarlos a mano o quedan huérfanos para siempre.
  const mediaPaths = db
    .prepare(
      `SELECT cs.media_path FROM competitor_scripts cs
       JOIN competitor_videos cv ON cv.id = cs.video_id
       WHERE cv.account_id = ? AND cs.user_id = ? AND cs.media_path IS NOT NULL`
    )
    .all(accountId, userId) as { media_path: string }[];

  db.prepare(`DELETE FROM competitor_accounts WHERE id = ? AND user_id = ?`).run(accountId, userId);
  for (const { media_path } of mediaPaths) deleteUploadIfExists(media_path);
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

// Solo los ids (sin el resto de columnas) que cumplen el filtro, sin paginar
// — para "seleccionar todos" en el frontend sin traer los datos completos de
// cada video de todas las páginas.
export function listVideoIds(userId: number, opts: { accountId?: number; status?: string } = {}): number[] {
  const extraWheres: string[] = [];
  const extraParams: unknown[] = [];
  if (opts.accountId !== undefined) { extraWheres.push("cv.account_id = ?"); extraParams.push(opts.accountId); }
  if (opts.status) { extraWheres.push("cv.status = ?"); extraParams.push(opts.status); }
  const whereClause = ["ca.user_id = ?", ...extraWheres].join(" AND ");
  return (
    db
      .prepare(
        `SELECT cv.id FROM competitor_videos cv JOIN competitor_accounts ca ON ca.id = cv.account_id WHERE ${whereClause}`
      )
      .all(userId, ...(extraParams as never[])) as { id: number }[]
  ).map((r) => r.id);
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

// Borra videos (scrapeados o ya analizados) elegidos a mano por el usuario.
// Acotado a las cuentas del propio userId, así que no puede tocar videos de
// otro usuario aunque intente colar un id ajeno. FK ON DELETE CASCADE se
// encarga de transcript/análisis/guiones adaptados asociados — pero no de los
// archivos de audio/video subidos a disco para esos guiones, que hay que
// limpiar a mano o quedan huérfanos ocupando espacio para siempre.
export function deleteVideos(userId: number, ids: number[]): number {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => "?").join(",");
  const mediaPaths = db
    .prepare(
      `SELECT media_path FROM competitor_scripts
       WHERE video_id IN (${placeholders}) AND user_id = ? AND media_path IS NOT NULL`
    )
    .all(...ids, userId) as { media_path: string }[];

  const res = db
    .prepare(
      `DELETE FROM competitor_videos
       WHERE id IN (${placeholders})
         AND account_id IN (SELECT id FROM competitor_accounts WHERE user_id = ?)`
    )
    .run(...ids, userId);
  for (const { media_path } of mediaPaths) deleteUploadIfExists(media_path);
  return Number(res.changes);
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

// Guiones adaptados de competencia ya generados HOY (medianoche UTC), para el
// tope diario configurable en Ajustes — mismo criterio de "día" que budget.ts
// usa para el tope de guiones normales (día UTC, no local).
export function competitorScriptsToday(userId: number): number {
  const day = todayUTC();
  const row = db
    .prepare(`SELECT COUNT(*) as n FROM competitor_scripts WHERE user_id = ? AND substr(created_at, 1, 10) = ?`)
    .get(userId, day) as { n: number };
  return row.n;
}

// ─── Adapted scripts ──────────────────────────────────────────────────────────

export type AdaptedScriptSort = "recent" | "views" | "likes" | "comments" | "viral";

const ADAPTED_SORT_SQL: Record<AdaptedScriptSort, string> = {
  recent: "cs.created_at DESC",
  views: "COALESCE(cv.views, 0) DESC, cs.created_at DESC",
  likes: "COALESCE(cv.likes, 0) DESC, cs.created_at DESC",
  comments: "COALESCE(cv.comments, 0) DESC, cs.created_at DESC",
  viral: "COALESCE(an.viral_score, 0) DESC, cs.created_at DESC",
};

type AdaptedScriptFilters = {
  accountId?: number;
  format?: string;
  status?: string;
  sort?: AdaptedScriptSort;
};

function adaptedScriptWhere(userId: number, f: AdaptedScriptFilters): { clause: string; params: unknown[] } {
  const wheres = ["cs.user_id = ?"];
  const params: unknown[] = [userId];
  if (f.accountId !== undefined) { wheres.push("ca.id = ?"); params.push(f.accountId); }
  if (f.format) { wheres.push("cs.format = ?"); params.push(f.format); }
  if (f.status) { wheres.push("cs.status = ?"); params.push(f.status); }
  return { clause: wheres.join(" AND "), params };
}

export function listAdaptedScripts(
  userId: number,
  opts: AdaptedScriptFilters & { limit?: number; offset?: number } = {}
): CompetitorScriptItem[] {
  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 0;
  const { clause, params } = adaptedScriptWhere(userId, opts);
  const orderBy = ADAPTED_SORT_SQL[opts.sort ?? "recent"];
  return db
    .prepare(
      `SELECT cs.id, cs.video_id, cs.user_id, cs.format, cs.title, cs.hook, cs.puente, cs.body, cs.cta, cs.adaptation_notes, cs.status, cs.model, cs.created_at,
              cs.media_path, cs.media_original_name, cs.media_mime, cs.media_size, cs.media_uploaded_at,
              cv.video_url, cv.title as video_title, cv.thumbnail_url, cv.views, cv.likes, cv.comments,
              ca.handle as account_handle, ca.platform as account_platform,
              an.hook as original_hook, an.viral_score
       FROM competitor_scripts cs
       JOIN competitor_videos cv ON cv.id = cs.video_id
       JOIN competitor_accounts ca ON ca.id = cv.account_id
       LEFT JOIN competitor_analyses an ON an.video_id = cv.id
       WHERE ${clause}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`
    )
    .all(...(params as never[]), limit, offset) as CompetitorScriptItem[];
}

// Solo los ids que cumplen el filtro actual, de TODAS las páginas — para
// "seleccionar todos" en el frontend sin traer cada guion completo.
export function listAdaptedScriptIds(userId: number, opts: AdaptedScriptFilters = {}): number[] {
  const { clause, params } = adaptedScriptWhere(userId, opts);
  return (
    db
      .prepare(
        `SELECT cs.id FROM competitor_scripts cs
         JOIN competitor_videos cv ON cv.id = cs.video_id
         JOIN competitor_accounts ca ON ca.id = cv.account_id
         WHERE ${clause}`
      )
      .all(...(params as never[])) as { id: number }[]
  ).map((r) => r.id);
}

export function countAdaptedScripts(userId: number, opts: AdaptedScriptFilters = {}): number {
  const { clause, params } = adaptedScriptWhere(userId, opts);
  return (
    db
      .prepare(
        `SELECT COUNT(*) as n FROM competitor_scripts cs
         JOIN competitor_videos cv ON cv.id = cs.video_id
         JOIN competitor_accounts ca ON ca.id = cv.account_id
         WHERE ${clause}`
      )
      .get(...(params as never[])) as { n: number }
  ).n;
}

export function updateCompetitorScriptStatus(userId: number, scriptId: number, status: string): void {
  db.prepare(`UPDATE competitor_scripts SET status = ? WHERE id = ? AND user_id = ?`).run(status, scriptId, userId);
}

// ─── Audio/video subido por el usuario (para el editor) ────────────────────────

export type ScriptMedia = {
  media_path: string | null;
  media_original_name: string | null;
  media_mime: string | null;
  media_size: number | null;
};

export function getScriptMedia(userId: number, scriptId: number): ScriptMedia | null {
  return (
    (db
      .prepare(
        `SELECT media_path, media_original_name, media_mime, media_size
         FROM competitor_scripts WHERE id = ? AND user_id = ?`
      )
      .get(scriptId, userId) as ScriptMedia | undefined) ?? null
  );
}

export function setScriptMedia(
  userId: number,
  scriptId: number,
  media: { path: string; originalName: string; mime: string; size: number }
): boolean {
  const res = db
    .prepare(
      `UPDATE competitor_scripts
       SET media_path = ?, media_original_name = ?, media_mime = ?, media_size = ?, media_uploaded_at = ?
       WHERE id = ? AND user_id = ?`
    )
    .run(media.path, media.originalName, media.mime, media.size, new Date().toISOString(), scriptId, userId);
  return res.changes > 0;
}

// Devuelve la ruta del archivo que había (para poder borrarlo del disco) y
// limpia los campos en la BD. null si no había nada o el script no es tuyo.
export function clearScriptMedia(userId: number, scriptId: number): string | null {
  const current = getScriptMedia(userId, scriptId);
  if (!current?.media_path) return null;
  db.prepare(
    `UPDATE competitor_scripts
     SET media_path = NULL, media_original_name = NULL, media_mime = NULL, media_size = NULL, media_uploaded_at = NULL
     WHERE id = ? AND user_id = ?`
  ).run(scriptId, userId);
  return current.media_path;
}

// ─── Accounts que toca comprobar ahora ────────────────────────────────────────

// Sin userId: TODAS las cuentas debidas de TODOS los usuarios (uso del worker
// de fondo, que sí debe barrer a todo el mundo). Con userId: solo las de ese
// usuario (uso de los endpoints HTTP, para no procesar cuentas ajenas como
// efecto colateral de que un usuario pulse "revisar ahora").
export function accountsDue(userId?: number): { id: number; user_id: number; platform: string; handle: string; url: string; check_interval_hours: number; min_views: number; min_likes: number; min_comments: number; scan_limit: number }[] {
  const scope = userId !== undefined ? ` AND user_id = ?` : ``;
  const params = userId !== undefined ? [userId] : [];
  return db
    .prepare(
      `SELECT id, user_id, platform, handle, url, check_interval_hours, min_views, min_likes, min_comments, scan_limit
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
