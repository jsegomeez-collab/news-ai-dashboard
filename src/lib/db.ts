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

CREATE TABLE IF NOT EXISTS classifications (
  article_id      INTEGER PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  relevance       INTEGER NOT NULL,
  category        TEXT,
  business_angle  TEXT,
  actuality_link  TEXT,
  model           TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_class_relevance ON classifications(relevance DESC);

CREATE TABLE IF NOT EXISTS scripts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
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
CREATE INDEX IF NOT EXISTS idx_scripts_created ON scripts(created_at DESC);

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
  day            TEXT PRIMARY KEY,
  calls          INTEGER NOT NULL DEFAULT 0,
  input_tokens   INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  cost_usd       REAL NOT NULL DEFAULT 0,
  scripts_count  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Cola simple de generación: artículos relevantes pendientes de convertir en guion.
CREATE TABLE IF NOT EXISTS gen_queue (
  article_id  INTEGER PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  enqueued_at TEXT NOT NULL,
  done        INTEGER NOT NULL DEFAULT 0
);

-- Lotes de clasificación en curso (Batch API).
CREATE TABLE IF NOT EXISTS classify_batches (
  batch_id    TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'in_progress'
);

-- Bases de negocio / tonalidad / historia editables desde el frontend.
CREATE TABLE IF NOT EXISTS brand_docs (
  kind        TEXT PRIMARY KEY,   -- problema | cliente-ideal | oferta | competencia | tonalidad | historia
  content     TEXT,
  updated_at  TEXT
);

-- "Swipe file": guiones de la competencia que funcionaron, para replicar lo que va bien.
CREATE TABLE IF NOT EXISTS swipe_files (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  platform    TEXT,
  author      TEXT,
  content     TEXT NOT NULL,
  why         TEXT,               -- por qué funcionó (opcional)
  created_at  TEXT NOT NULL
);

-- Métricas de rendimiento de tus propios guiones publicados.
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

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}
export function setSetting(key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}
