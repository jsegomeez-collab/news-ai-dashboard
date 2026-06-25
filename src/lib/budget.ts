import { db } from "./db";
import { env } from "./env";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

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

export function budgetState(): BudgetState {
  const row = db
    .prepare("SELECT scripts_count, cost_usd FROM usage_log WHERE day = ?")
    .get(today()) as { scripts_count: number; cost_usd: number } | undefined;

  const scriptsToday = row?.scripts_count ?? 0;
  const costToday = row?.cost_usd ?? 0;
  const scriptsLeft = Math.max(0, env.maxScriptsPerDay - scriptsToday);
  const usdLeft = Math.max(0, env.maxDailyUsd - costToday);

  let reason: string | null = null;
  if (scriptsLeft <= 0) reason = "Alcanzado el tope diario de guiones";
  else if (usdLeft <= 0) reason = "Alcanzado el tope diario de gasto (USD)";

  return {
    day: today(),
    scriptsToday,
    costToday,
    maxScripts: env.maxScriptsPerDay,
    maxUsd: env.maxDailyUsd,
    scriptsLeft,
    usdLeft,
    canGenerate: reason === null,
    reason,
  };
}
