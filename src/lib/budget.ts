import { db } from "./db";
import { readUserSettings } from "./settings";
import { todayUTC } from "./env";

export type BudgetState = {
  day: string;
  scriptsToday: number;
  costToday: number;
  maxScripts: number;
  maxUsd: number;
  scriptsLeft: number;
  usdLeft: number;
  canGenerate: boolean;
  reason: string | null;
};

export function budgetState(userId: number): BudgetState {
  const s = readUserSettings(userId);
  const day = todayUTC();
  const row = db
    .prepare(`SELECT scripts_count, cost_usd FROM usage_log WHERE user_id = ? AND day = ?`)
    .get(userId, day) as { scripts_count: number; cost_usd: number } | undefined;

  const scriptsToday = row?.scripts_count ?? 0;
  const costToday = row?.cost_usd ?? 0;
  const scriptsLeft = Math.max(0, s.maxScriptsPerDay - scriptsToday);
  const usdLeft = Math.max(0, s.maxDailyUsd - costToday);

  let reason: string | null = null;
  if (scriptsLeft <= 0) reason = "Alcanzado el tope diario de guiones";
  else if (usdLeft <= 0) reason = "Alcanzado el tope diario de gasto (USD)";

  return {
    day,
    scriptsToday,
    costToday,
    maxScripts: s.maxScriptsPerDay,
    maxUsd: s.maxDailyUsd,
    scriptsLeft,
    usdLeft,
    canGenerate: reason === null,
    reason,
  };
}
