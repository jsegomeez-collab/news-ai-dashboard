import { db } from "./db";

export type UserSettings = {
  anthropicKey: string;
  openaiKey: string;
  apifyToken: string;
  genModel: string;
  autoGenerate: boolean;
  genRelevanceThreshold: number;
  newsMinRelevance: number;
  maxScriptsPerDay: number;
  maxDailyUsd: number;
  formats: ("reel" | "youtube")[];
  windowMinutes: number;
  windowIntervalHours: number;
  competitorAdaptLimit: number; // guiones de competencia adaptados como máximo por día (UTC). 0 = sin tope.
  // Clonación con IA (HeyGen): avatar_id/voice_id elegidos de la cuenta del
  // usuario (API v3: un único "look" por avatar, sin distinguir tipos).
  // heygenDailyUsdCap es su propio tope, separado del de Anthropic (0 = sin
  // tope), porque el coste por vídeo es de otro orden de magnitud.
  heygenKey: string;
  heygenAvatarId: string;
  heygenAvatarLabel: string;
  heygenVoiceId: string;
  heygenVoiceLabel: string;
  heygenDailyUsdCap: number;
  // Ventana horaria (UTC) para auto-programar vídeos ya generados en el
  // calendario — ver autoSchedule.ts.
  postingWindowStartHour: number;
  postingWindowEndHour: number;
  // Metricool: token fijo de tu cuenta (API REST, no su MCP — igual que
  // HeyGen: el MCP es para agentes conversacionales, no para este worker) +
  // el userId que la API exige junto al token en cada llamada.
  metricoolUserToken: string;
  metricoolUserId: string;
};

// Versión de UserSettings segura para mandar al navegador: las claves reales
// NUNCA salen de aquí — sk-ant-/sk-.../apify_api_... son secretos que se
// facturan a la cuenta del usuario, así que aunque el input en Ajustes sea
// type="password", devolverlas en el JSON las deja visibles en la pestaña
// Red y en React DevTools sin que haga falta ni un XSS. Solo se manda si
// cada una está configurada (booleano) — cero bytes del valor real.
export type SafeUserSettings = Omit<
  UserSettings,
  "anthropicKey" | "openaiKey" | "apifyToken" | "heygenKey" | "metricoolUserToken"
> & {
  hasAnthropicKey: boolean;
  hasOpenaiKey: boolean;
  hasApifyToken: boolean;
  hasHeygenKey: boolean;
  hasMetricoolToken: boolean;
};

export function toSafeSettings(s: UserSettings): SafeUserSettings {
  const { anthropicKey, openaiKey, apifyToken, heygenKey, metricoolUserToken, ...rest } = s;
  return {
    ...rest,
    hasAnthropicKey: anthropicKey.startsWith("sk-ant-"),
    hasOpenaiKey: !!openaiKey,
    hasApifyToken: !!apifyToken,
    hasHeygenKey: !!heygenKey,
    hasMetricoolToken: !!metricoolUserToken,
  };
}

type Row = {
  anthropic_key: string;
  openai_key: string;
  apify_token: string;
  gen_model: string;
  auto_generate: number;
  gen_relevance_threshold: number;
  news_min_relevance: number;
  max_scripts_per_day: number;
  max_daily_usd: number;
  formats: string;
  window_minutes: number;
  window_interval_hours: number;
  competitor_adapt_limit: number;
  heygen_key: string;
  heygen_avatar_id: string;
  heygen_avatar_label: string;
  heygen_voice_id: string;
  heygen_voice_label: string;
  heygen_daily_usd_cap: number;
  posting_window_start_hour: number;
  posting_window_end_hour: number;
  metricool_user_token: string;
  metricool_user_id: string;
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
    openaiKey: r.openai_key ?? "",
    apifyToken: r.apify_token ?? "",
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
    competitorAdaptLimit: r.competitor_adapt_limit,
    heygenKey: r.heygen_key ?? "",
    heygenAvatarId: r.heygen_avatar_id ?? "",
    heygenAvatarLabel: r.heygen_avatar_label ?? "",
    heygenVoiceId: r.heygen_voice_id ?? "",
    heygenVoiceLabel: r.heygen_voice_label ?? "",
    heygenDailyUsdCap: r.heygen_daily_usd_cap,
    postingWindowStartHour: r.posting_window_start_hour,
    postingWindowEndHour: r.posting_window_end_hour,
    metricoolUserToken: r.metricool_user_token ?? "",
    metricoolUserId: r.metricool_user_id ?? "",
  };
}

export function writeUserSettings(userId: number, p: Partial<UserSettings>): UserSettings {
  ensure(userId);
  const map: [keyof UserSettings, string, (v: unknown) => unknown][] = [
    ["anthropicKey", "anthropic_key", (v) => String(v ?? "").trim()],
    ["openaiKey", "openai_key", (v) => String(v ?? "").trim()],
    ["apifyToken", "apify_token", (v) => String(v ?? "").trim()],
    ["genModel", "gen_model", (v) => String(v)],
    ["autoGenerate", "auto_generate", (v) => (v ? 1 : 0)],
    ["genRelevanceThreshold", "gen_relevance_threshold", (v) => clampInt(v, 0, 100)],
    ["newsMinRelevance", "news_min_relevance", (v) => clampInt(v, 0, 100)],
    ["maxScriptsPerDay", "max_scripts_per_day", (v) => clampInt(v, 0, 500)],
    ["maxDailyUsd", "max_daily_usd", (v) => Math.max(0, Number(v) || 0)],
    ["formats", "formats", (v) => (v as string[]).join(",")],
    ["windowMinutes", "window_minutes", (v) => clampInt(v, 0, 1440)],
    ["windowIntervalHours", "window_interval_hours", (v) => clampInt(v, 0, 24)],
    ["competitorAdaptLimit", "competitor_adapt_limit", (v) => clampInt(v, 0, 500)],
    ["heygenKey", "heygen_key", (v) => String(v ?? "").trim()],
    ["heygenAvatarId", "heygen_avatar_id", (v) => String(v ?? "").trim()],
    ["heygenAvatarLabel", "heygen_avatar_label", (v) => String(v ?? "").trim()],
    ["heygenVoiceId", "heygen_voice_id", (v) => String(v ?? "").trim()],
    ["heygenVoiceLabel", "heygen_voice_label", (v) => String(v ?? "").trim()],
    ["heygenDailyUsdCap", "heygen_daily_usd_cap", (v) => Math.max(0, Number(v) || 0)],
    ["postingWindowStartHour", "posting_window_start_hour", (v) => clampInt(v, 0, 23)],
    ["postingWindowEndHour", "posting_window_end_hour", (v) => clampInt(v, 1, 24)],
    ["metricoolUserToken", "metricool_user_token", (v) => String(v ?? "").trim()],
    ["metricoolUserId", "metricool_user_id", (v) => String(v ?? "").trim()],
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
// windowIntervalHours horas, alineadas a la medianoche UTC.
// Usa horas UTC (no locales) a propósito: el tope diario de gasto/guiones
// (budget.ts, vía todayUTC()) resetea a medianoche UTC. Si esta ventana usara
// la hora local del servidor y éste corriera en un TZ distinto de UTC, la
// "ráfaga diaria" y el "tope diario" apuntarían a dos días distintos.
export function withinGenerationWindow(s: UserSettings, now = new Date()): boolean {
  if (s.windowIntervalHours <= 0 || s.windowMinutes <= 0) return true;
  const minutesOfDay = now.getUTCHours() * 60 + now.getUTCMinutes();
  const cycle = s.windowIntervalHours * 60;
  return minutesOfDay % cycle < s.windowMinutes;
}

export const GEN_MODEL_OPTIONS = [
  { id: "claude-opus-4-8", label: "Opus 4.8 (máxima calidad)" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 (equilibrado, más barato)" },
];
