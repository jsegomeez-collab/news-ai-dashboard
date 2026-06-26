import { db } from "./db";

export type UserSettings = {
  anthropicKey: string;
  genModel: string;
  autoGenerate: boolean;
  genRelevanceThreshold: number; // relevancia mínima para generar guion
  newsMinRelevance: number; // relevancia mínima para mostrar en el feed
  maxScriptsPerDay: number;
  maxDailyUsd: number;
  formats: ("reel" | "youtube")[];
  windowMinutes: number; // duración de cada ráfaga de generación (0 = sin ventana)
  windowIntervalHours: number; // cada cuántas horas arranca una ráfaga (0 = siempre activo)
};

type Row = {
  anthropic_key: string;
  gen_model: string;
  auto_generate: number;
  gen_relevance_threshold: number;
  news_min_relevance: number;
  max_scripts_per_day: number;
  max_daily_usd: number;
  formats: string;
  window_minutes: number;
  window_interval_hours: number;
};

function ensure(userId: number): void {
  db.prepare(
    `INSERT INTO user_settings(user_id, updated_at) VALUES(?, ?) ON CONFLICT(user_id) DO NOTHING`
  ).run(userId, new Date().toISOString());
}

export function readUserSettings(userId: number): UserSettings {
  ensure(userId);
  const r = db.prepare(`SELECT * FROM user_settings WHERE user_id = ?`).get(userId) as Row;
  return {
    anthropicKey: r.anthropic_key ?? "",
    genModel: r.gen_model || "claude-opus-4-8",
    autoGenerate: !!r.auto_generate,
    genRelevanceThreshold: r.gen_relevance_threshold,
    newsMinRelevance: r.news_min_relevance,
    maxScriptsPerDay: r.max_scripts_per_day,
    maxDailyUsd: r.max_daily_usd,
    formats: (r.formats || "reel,youtube")
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is "reel" | "youtube" => s === "reel" || s === "youtube"),
    windowMinutes: r.window_minutes,
    windowIntervalHours: r.window_interval_hours,
  };
}

export function writeUserSettings(userId: number, p: Partial<UserSettings>): UserSettings {
  ensure(userId);
  const map: [keyof UserSettings, string, (v: unknown) => unknown][] = [
    ["anthropicKey", "anthropic_key", (v) => String(v ?? "").trim()],
    ["genModel", "gen_model", (v) => String(v)],
    ["autoGenerate", "auto_generate", (v) => (v ? 1 : 0)],
    ["genRelevanceThreshold", "gen_relevance_threshold", (v) => clampInt(v, 0, 100)],
    ["newsMinRelevance", "news_min_relevance", (v) => clampInt(v, 0, 100)],
    ["maxScriptsPerDay", "max_scripts_per_day", (v) => clampInt(v, 0, 500)],
    ["maxDailyUsd", "max_daily_usd", (v) => Math.max(0, Number(v) || 0)],
    ["formats", "formats", (v) => (v as string[]).join(",")],
    ["windowMinutes", "window_minutes", (v) => clampInt(v, 0, 1440)],
    ["windowIntervalHours", "window_interval_hours", (v) => clampInt(v, 0, 24)],
  ];
  for (const [key, col, fn] of map) {
    if (p[key] !== undefined) {
      db.prepare(`UPDATE user_settings SET ${col} = ?, updated_at = ? WHERE user_id = ?`).run(
        fn(p[key]) as never,
        new Date().toISOString(),
        userId
      );
    }
  }
  return readUserSettings(userId);
}

function clampInt(v: unknown, min: number, max: number): number {
  const n = Math.round(Number(v) || 0);
  return Math.max(min, Math.min(max, n));
}

export function hasUserKey(userId: number): boolean {
  return readUserSettings(userId).anthropicKey.startsWith("sk-ant-");
}

// ¿Estamos dentro de una ráfaga de generación activa según la ventana del usuario?
// windowIntervalHours=0 → siempre activo. Si no, ráfagas de windowMinutes cada
// windowIntervalHours horas, alineadas a la medianoche.
export function withinGenerationWindow(s: UserSettings, now = new Date()): boolean {
  if (s.windowIntervalHours <= 0 || s.windowMinutes <= 0) return true;
  const minutesOfDay = now.getHours() * 60 + now.getMinutes();
  const cycle = s.windowIntervalHours * 60;
  return minutesOfDay % cycle < s.windowMinutes;
}

export const GEN_MODEL_OPTIONS = [
  { id: "claude-opus-4-8", label: "Opus 4.8 (máxima calidad)" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 (equilibrado, más barato)" },
];
