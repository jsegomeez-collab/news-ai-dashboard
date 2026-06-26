import { DatabaseSync, type StatementSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// En hosts con disco persistente (Railway/Render), apunta DB_PATH al volumen
// montado (p.ej. /data/app.db) para que la BD sobreviva a los redeploys.
const DB_PATH = process.env.DB_PATH?.trim() || join(process.cwd(), "data", "app.db");

type Stmt = StatementSync;

// Conexión PEREZOSA: no abrimos la BD al importar el módulo (importante para que
// `next build` no la abra durante "collect page data" y choque con otros procesos).
// Se abre y se crea el esquema en el primer uso real (request/worker).
let _raw: DatabaseSync | null = null;
function getRaw(): DatabaseSync {
  if (_raw) return _raw;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const r = new DatabaseSync(DB_PATH);
  r.exec("PRAGMA journal_mode = WAL;");
  r.exec("PRAGMA busy_timeout = 5000;");
  initSchema(r);
  _raw = r;
  return r;
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
`);
}

