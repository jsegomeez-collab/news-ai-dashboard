import { DatabaseSync, type StatementSync } from "node:sqlite";
import { mkdirSync, existsSync, accessSync, constants } from "node:fs";
import { dirname, join } from "node:path";

// Resuelve dónde vive la BD, priorizando un DISCO PERSISTENTE para que las
// cuentas/guiones NO se borren en cada deploy:
//   1) DB_PATH si está definido (lo ideal en producción).
//   2) /data o /var/data si existe y es escribible (convención de discos en
//      Render/Railway) → auto-detección por si olvidaste poner DB_PATH.
//   3) ./data/app.db (solo local; en un host serverless esto NO persiste).
function resolveDbPath(): { path: string; persistent: boolean; reason: string } {
  const explicit = process.env.DB_PATH?.trim();
  if (explicit) return { path: explicit, persistent: true, reason: "DB_PATH" };

  for (const mount of ["/data", "/var/data"]) {
    try {
      if (existsSync(mount)) {
        accessSync(mount, constants.W_OK);
        return { path: join(mount, "app.db"), persistent: true, reason: `disco en ${mount}` };
      }
    } catch {
      /* no escribible: probar siguiente */
    }
  }
  return { path: join(process.cwd(), "data", "app.db"), persistent: false, reason: "local (efímero)" };
}

const RESOLVED = resolveDbPath();
const DB_PATH = RESOLVED.path;

type Stmt = StatementSync;

// Conexión PEREZOSA: no abrimos la BD al importar el módulo (importante para que
// `next build` no la abra durante "collect page data" y choque con otros procesos).
// Se abre y se crea el esquema en el primer uso real (request/worker).
let _raw: DatabaseSync | null = null;
function getRaw(): DatabaseSync {
  if (_raw) return _raw;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  console.log(`[db] Base de datos: ${DB_PATH} (${RESOLVED.reason})`);
  if (!RESOLVED.persistent && process.env.NODE_ENV === "production") {
    console.warn(
      "[db] ⚠ AVISO: la BD NO está en un disco persistente. En cada deploy se " +
        "BORRARÁN las cuentas. Monta un disco (p.ej. en /data) y pon DB_PATH=/data/app.db."
    );
  }
  const r = new DatabaseSync(DB_PATH);
  r.exec("PRAGMA journal_mode = WAL;");
  r.exec("PRAGMA busy_timeout = 5000;");
  initSchema(r);
  _raw = r;
  return r;
}

export function dbInfo(): { path: string; persistent: boolean; reason: string } {
  return { path: DB_PATH, persistent: RESOLVED.persistent, reason: RESOLVED.reason };
}

// Adaptador fino que expone el subconjunto de la API de better-sqlite3 que usamos.
export const db = {
  exec: (sql: string): void => getRaw().exec(sql),
  prepare: (sql: string): Stmt => {
    const s = getRaw().prepare(sql);
    // Permite pasar parámetros nombrados con claves "desnudas" (sin @/:/$).
    try {
      (s as unknown as { setAllowBareNamedParameters?: (b: boolean) => void })
        .setAllowBareNamedParameters?.(true);
    } catch {
      /* versiones antiguas */
    }
    return s;
  },
  // Envuelve una función en una transacción. Devuelve una función que la ejecuta.
  transaction<A>(fn: (arg: A) => void): (arg: A) => void {
    return (arg: A) => {
      const r = getRaw();
      r.exec("BEGIN");
      try {
        fn(arg);
        r.exec("COMMIT");
      } catch (e) {
        r.exec("ROLLBACK");
        throw e;
      }
    };
  },
};

function initSchema(r: DatabaseSync): void {
  r.exec(`
-- ===== Cuentas y sesiones (auth nativa sobre SQLite) =====
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  email          TEXT NOT NULL UNIQUE,
  name           TEXT,
  password_hash  TEXT NOT NULL,
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Ajustes por usuario (incluida su clave de Anthropic y los parámetros de generación).
CREATE TABLE IF NOT EXISTS user_settings (
  user_id                INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  anthropic_key          TEXT NOT NULL DEFAULT '',
  gen_model              TEXT NOT NULL DEFAULT 'claude-opus-4-8',
  auto_generate          INTEGER NOT NULL DEFAULT 1,
  gen_relevance_threshold INTEGER NOT NULL DEFAULT 80,
  news_min_relevance     INTEGER NOT NULL DEFAULT 55,
  max_scripts_per_day    INTEGER NOT NULL DEFAULT 15,
  max_daily_usd          REAL NOT NULL DEFAULT 5,
  formats                TEXT NOT NULL DEFAULT 'reel,youtube',
  window_minutes         INTEGER NOT NULL DEFAULT 0,   -- 0 = sin ventana (siempre activo)
  window_interval_hours  INTEGER NOT NULL DEFAULT 0,   -- 0 = sin ventana (siempre activo)
  updated_at             TEXT
);

-- ===== Noticias: pool GLOBAL compartido (se trae una sola vez) =====
CREATE TABLE IF NOT EXISTS articles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source        TEXT NOT NULL,
  url           TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  summary       TEXT,
  published_at  TEXT,
  fetched_at    TEXT NOT NULL,
  raw_json      TEXT
);
CREATE INDEX IF NOT EXISTS idx_articles_fetched ON articles(fetched_at DESC);

-- ===== Todo lo demás es PRIVADO por usuario =====
CREATE TABLE IF NOT EXISTS classifications (
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id      INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  relevance       INTEGER NOT NULL,
  category        TEXT,
  business_angle  TEXT,
  actuality_link  TEXT,
  model           TEXT,
  created_at      TEXT NOT NULL,
  PRIMARY KEY (user_id, article_id)
);
CREATE INDEX IF NOT EXISTS idx_class_relevance ON classifications(user_id, relevance DESC);

CREATE TABLE IF NOT EXISTS scripts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id  INTEGER REFERENCES articles(id) ON DELETE SET NULL,
  format      TEXT NOT NULL,
  title       TEXT,
  hook        TEXT,
  body        TEXT,
  cta         TEXT,
  status      TEXT NOT NULL DEFAULT 'borrador',
  model       TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scripts_user ON scripts(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS critiques (
  script_id    INTEGER PRIMARY KEY REFERENCES scripts(id) ON DELETE CASCADE,
  score        REAL NOT NULL,
  tone_match   REAL,
  strengths    TEXT,
  weaknesses   TEXT,
  improvements TEXT,
  model        TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_log (
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day            TEXT NOT NULL,
  calls          INTEGER NOT NULL DEFAULT 0,
  input_tokens   INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  cost_usd       REAL NOT NULL DEFAULT 0,
  scripts_count  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS gen_queue (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id  INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  enqueued_at TEXT NOT NULL,
  done        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, article_id)
);

CREATE TABLE IF NOT EXISTS classify_batches (
  batch_id    TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'in_progress'
);

CREATE TABLE IF NOT EXISTS brand_docs (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  content     TEXT,
  updated_at  TEXT,
  PRIMARY KEY (user_id, kind)
);

CREATE TABLE IF NOT EXISTS swipe_files (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  platform    TEXT,
  author      TEXT,
  content     TEXT NOT NULL,
  why         TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS script_metrics (
  script_id      INTEGER PRIMARY KEY REFERENCES scripts(id) ON DELETE CASCADE,
  views          INTEGER NOT NULL DEFAULT 0,
  likes          INTEGER NOT NULL DEFAULT 0,
  comments       INTEGER NOT NULL DEFAULT 0,
  shares         INTEGER NOT NULL DEFAULT 0,
  new_followers  INTEGER NOT NULL DEFAULT 0,
  published_at   TEXT,
  notes          TEXT,
  updated_at     TEXT
);

-- ===== ESPIONAJE DE COMPETENCIA =====
CREATE TABLE IF NOT EXISTS competitor_accounts (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform             TEXT NOT NULL,
  handle               TEXT NOT NULL,
  url                  TEXT NOT NULL,
  display_name         TEXT,
  active               INTEGER NOT NULL DEFAULT 1,
  min_views            INTEGER NOT NULL DEFAULT 50000,
  min_likes            INTEGER NOT NULL DEFAULT 0,
  min_comments         INTEGER NOT NULL DEFAULT 300,
  check_interval_hours INTEGER NOT NULL DEFAULT 6,
  last_checked_at      TEXT,
  created_at           TEXT NOT NULL,
  UNIQUE(user_id, platform, handle)
);
CREATE INDEX IF NOT EXISTS idx_comp_accounts_user ON competitor_accounts(user_id);

CREATE TABLE IF NOT EXISTS competitor_videos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id    INTEGER NOT NULL REFERENCES competitor_accounts(id) ON DELETE CASCADE,
  video_url     TEXT NOT NULL UNIQUE,
  video_id      TEXT,
  title         TEXT,
  description   TEXT,
  thumbnail_url TEXT,
  views         INTEGER,
  likes         INTEGER,
  comments      INTEGER,
  shares        INTEGER,
  duration_sec  INTEGER,
  published_at  TEXT,
  fetched_at    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  error_msg     TEXT
);
CREATE INDEX IF NOT EXISTS idx_comp_videos_account ON competitor_videos(account_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_comp_videos_status  ON competitor_videos(status);

CREATE TABLE IF NOT EXISTS competitor_transcripts (
  video_id    INTEGER PRIMARY KEY REFERENCES competitor_videos(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  language    TEXT,
  model       TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS competitor_analyses (
  video_id          INTEGER PRIMARY KEY REFERENCES competitor_videos(id) ON DELETE CASCADE,
  hook              TEXT,
  hook_type         TEXT,
  winning_idea      TEXT,
  curiosity_gap     TEXT,
  viral_pattern     TEXT,
  why_it_works      TEXT,
  content_structure TEXT,
  viral_score       INTEGER,
  model             TEXT,
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS competitor_scripts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id         INTEGER NOT NULL REFERENCES competitor_videos(id) ON DELETE CASCADE,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  format           TEXT NOT NULL,
  title            TEXT,
  hook             TEXT,
  body             TEXT,
  cta              TEXT,
  adaptation_notes TEXT,
  status           TEXT NOT NULL DEFAULT 'borrador',
  model            TEXT,
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comp_scripts_user  ON competitor_scripts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comp_scripts_video ON competitor_scripts(video_id);
`);

  // Columnas añadidas en versiones posteriores. Usamos PRAGMA para no depender
  // de la sintaxis "IF NOT EXISTS" de ALTER TABLE (no disponible en SQLite < 3.37).
  const cols = r.prepare(`PRAGMA table_info(user_settings)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === "openai_key")) {
    r.exec(`ALTER TABLE user_settings ADD COLUMN openai_key TEXT NOT NULL DEFAULT ''`);
    console.log("[db] columna openai_key añadida a user_settings");
  }
  if (!cols.some((c) => c.name === "apify_token")) {
    r.exec(`ALTER TABLE user_settings ADD COLUMN apify_token TEXT NOT NULL DEFAULT ''`);
    console.log("[db] columna apify_token añadida a user_settings");
  }

  // media_url: URL directa del mp4 (Instagram vía Apify) para descargar el audio
  // sin yt-dlp. Las URLs de Instagram caducan, por eso se transcriben en el mismo ciclo.
  const vcols = r.prepare(`PRAGMA table_info(competitor_videos)`).all() as { name: string }[];
  if (!vcols.some((c) => c.name === "media_url")) {
    r.exec(`ALTER TABLE competitor_videos ADD COLUMN media_url TEXT`);
    console.log("[db] columna media_url añadida a competitor_videos");
  }

  // puente: transición del hook literal al vehículo único del creador.
  const scols = r.prepare(`PRAGMA table_info(competitor_scripts)`).all() as { name: string }[];
  if (!scols.some((c) => c.name === "puente")) {
    r.exec(`ALTER TABLE competitor_scripts ADD COLUMN puente TEXT`);
    console.log("[db] columna puente añadida a competitor_scripts");
  }
}

