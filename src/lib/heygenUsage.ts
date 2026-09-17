import { db } from "./db";
import { readUserSettings } from "./settings";
import { todayUTC } from "./env";

// Igual que budget.ts (Anthropic), pero para el gasto de HeyGen: es un orden
// de magnitud más caro por unidad ($ por vídeo vs. $ por guion de texto), así
// que tiene su propio tope diario en vez de compartir maxDailyUsd.
export type HeygenBudgetState = {
  day: string;
  costToday: number;
  videosToday: number;
  maxUsd: number; // 0 = sin tope
  usdLeft: number;
  canGenerate: boolean;
  reason: string | null;
};

export function heygenBudgetState(userId: number): HeygenBudgetState {
  const s = readUserSettings(userId);
  const day = todayUTC();
  const row = db
    .prepare(`SELECT videos, cost_usd FROM heygen_usage_log WHERE user_id = ? AND day = ?`)
    .get(userId, day) as { videos: number; cost_usd: number } | undefined;

  const costToday = row?.cost_usd ?? 0;
  const videosToday = row?.videos ?? 0;
  const usdLeft = s.heygenDailyUsdCap > 0 ? Math.max(0, s.heygenDailyUsdCap - costToday) : Infinity;

  return {
    day,
    costToday,
    videosToday,
    maxUsd: s.heygenDailyUsdCap,
    usdLeft,
    canGenerate: s.heygenDailyUsdCap <= 0 || usdLeft > 0,
    reason: s.heygenDailyUsdCap > 0 && usdLeft <= 0 ? "Tope diario de gasto en HeyGen alcanzado" : null,
  };
}

export function recordHeygenUsage(userId: number, seconds: number, costUsd: number): void {
  const day = todayUTC();
  db.prepare(
    `INSERT INTO heygen_usage_log(user_id, day, videos, seconds, cost_usd) VALUES(?, ?, 1, ?, ?)
     ON CONFLICT(user_id, day) DO UPDATE SET
       videos = videos + 1, seconds = seconds + excluded.seconds, cost_usd = cost_usd + excluded.cost_usd`
  ).run(userId, day, seconds, costUsd);
}
