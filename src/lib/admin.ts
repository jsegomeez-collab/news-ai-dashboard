import { db } from "./db";
import { todayUTC } from "./env";
import { deleteUploadIfExists } from "./uploads";

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
  cost_month: number;
  heygen_cost_today: number;
  heygen_cost_month: number;
  heygen_cost_total: number;
  last_activity_at: string | null;
  max_scripts_per_day: number;
  max_daily_usd: number;
  competitor_adapt_limit: number;
  heygen_daily_usd_cap: number;
  has_key: number;
};

// Mes actual en UTC como "YYYY-MM" — mismo criterio de "día" (UTC) que usa
// todayUTC() para el resto de topes/gasto, para que "gasto de este mes" no
// se desalinee con "gasto de hoy" por usar zonas horarias distintas.
function monthPrefixUTC(): string {
  return todayUTC().slice(0, 7);
}

export function adminOverview(): {
  users: AdminUserRow[];
  totals: { users: number; articles: number; scripts: number; costTotal: number; costToday: number };
} {
  const day = todayUTC();
  const month = monthPrefixUTC();
  const users = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.created_at,
              (SELECT COUNT(*) FROM scripts s WHERE s.user_id = u.id) AS scripts,
              (SELECT COUNT(*) FROM classifications c WHERE c.user_id = u.id) AS classified,
              (SELECT COALESCE(SUM(cost_usd),0) FROM usage_log ul WHERE ul.user_id = u.id) AS cost_total,
              (SELECT COALESCE(SUM(scripts_count),0) FROM usage_log ul WHERE ul.user_id = u.id) AS scripts_total,
              (SELECT COALESCE(cost_usd,0) FROM usage_log ul WHERE ul.user_id = u.id AND ul.day = ?) AS cost_today,
              (SELECT COALESCE(SUM(cost_usd),0) FROM usage_log ul WHERE ul.user_id = u.id AND ul.day LIKE ? || '%') AS cost_month,
              (SELECT COALESCE(cost_usd,0) FROM heygen_usage_log hl WHERE hl.user_id = u.id AND hl.day = ?) AS heygen_cost_today,
              (SELECT COALESCE(SUM(cost_usd),0) FROM heygen_usage_log hl WHERE hl.user_id = u.id AND hl.day LIKE ? || '%') AS heygen_cost_month,
              (SELECT COALESCE(SUM(cost_usd),0) FROM heygen_usage_log hl WHERE hl.user_id = u.id) AS heygen_cost_total,
              (SELECT MAX(x.ts) FROM (
                 SELECT MAX(created_at) AS ts FROM scripts WHERE user_id = u.id
                 UNION ALL SELECT MAX(created_at) FROM competitor_scripts WHERE user_id = u.id
                 UNION ALL SELECT MAX(created_at) FROM heygen_renders WHERE user_id = u.id
               ) x) AS last_activity_at,
              us.max_scripts_per_day, us.max_daily_usd, us.competitor_adapt_limit, us.heygen_daily_usd_cap,
              (CASE WHEN us.anthropic_key LIKE 'sk-ant-%' THEN 1 ELSE 0 END) AS has_key
       FROM users u
       LEFT JOIN user_settings us ON us.user_id = u.id
       ORDER BY cost_total DESC, u.created_at DESC`
    )
    .all(day, month, day, month) as AdminUserRow[];

  const num = (sql: string, ...a: unknown[]) =>
    (db.prepare(sql).get(...(a as never[])) as { n: number }).n;

  return {
    users,
    totals: {
      users: users.length,
      articles: num(`SELECT COUNT(*) n FROM articles`),
      scripts: num(`SELECT COUNT(*) n FROM scripts`),
      costTotal: users.reduce((s, u) => s + (u.cost_total || 0) + (u.heygen_cost_total || 0), 0),
      costToday: users.reduce((s, u) => s + (u.cost_today || 0) + (u.heygen_cost_today || 0), 0),
    },
  };
}

// Borra una cuenta de usuario entera: guiones, clasificaciones, cuentas de
// competencia y sus videos/transcripts/análisis/guiones adaptados, renders de
// HeyGen, Drive, Calendario, ajustes... todo lo que tenga user_id en cascada
// (confirmado: node:sqlite trae foreign_keys=ON por defecto, los ON DELETE
// CASCADE del esquema sí se ejecutan de verdad). Eso limpia las FILAS, pero
// NUNCA los archivos físicos en disco — hay que recogerlos ANTES de borrar
// (una vez cae la fila, se pierde la ruta) y borrarlos aparte, mismo motivo
// que deleteAccount() en competitor.ts.
export function deleteUserAccount(userId: number): void {
  const paths: (string | null)[] = [
    ...(db.prepare(`SELECT path FROM drive_files WHERE user_id = ?`).all(userId) as { path: string }[]).map((r) => r.path),
    ...(db.prepare(`SELECT audio_path FROM content_items WHERE user_id = ?`).all(userId) as { audio_path: string | null }[]).map((r) => r.audio_path),
    ...(db.prepare(`SELECT video_path FROM content_items WHERE user_id = ?`).all(userId) as { video_path: string | null }[]).map((r) => r.video_path),
    ...(db.prepare(`SELECT video_path FROM heygen_renders WHERE user_id = ?`).all(userId) as { video_path: string | null }[]).map((r) => r.video_path),
    ...(db.prepare(`SELECT media_path FROM competitor_scripts WHERE user_id = ?`).all(userId) as { media_path: string | null }[]).map((r) => r.media_path),
  ];

  db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);

  for (const p of paths) deleteUploadIfExists(p);
}
