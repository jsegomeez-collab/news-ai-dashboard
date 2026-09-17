import { db } from "./db";
import { todayUTC } from "./env";

export type AdminUserRow = {
  id: number;
  email: string;
  name: string | null;
  created_at: string;
  scripts: number;
  classified: number;
  cost_total: number;
  scripts_total: number;
  cost_today: number;
  has_key: number;
};

export function adminOverview(): {
  users: AdminUserRow[];
  totals: { users: number; articles: number; scripts: number; costTotal: number; costToday: number };
} {
  const users = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.created_at,
              (SELECT COUNT(*) FROM scripts s WHERE s.user_id = u.id) AS scripts,
              (SELECT COUNT(*) FROM classifications c WHERE c.user_id = u.id) AS classified,
              (SELECT COALESCE(SUM(cost_usd),0) FROM usage_log ul WHERE ul.user_id = u.id) AS cost_total,
              (SELECT COALESCE(SUM(scripts_count),0) FROM usage_log ul WHERE ul.user_id = u.id) AS scripts_total,
              (SELECT COALESCE(cost_usd,0) FROM usage_log ul WHERE ul.user_id = u.id AND ul.day = ?) AS cost_today,
              (SELECT CASE WHEN anthropic_key LIKE 'sk-ant-%' THEN 1 ELSE 0 END FROM user_settings us WHERE us.user_id = u.id) AS has_key
       FROM users u
       ORDER BY cost_total DESC, u.created_at DESC`
    )
    .all(todayUTC()) as AdminUserRow[];

  const num = (sql: string, ...a: unknown[]) =>
    (db.prepare(sql).get(...(a as never[])) as { n: number }).n;

  return {
    users,
    totals: {
      users: users.length,
      articles: num(`SELECT COUNT(*) n FROM articles`),
      scripts: num(`SELECT COUNT(*) n FROM scripts`),
      costTotal: users.reduce((s, u) => s + (u.cost_total || 0), 0),
      costToday: users.reduce((s, u) => s + (u.cost_today || 0), 0),
    },
  };
}
