import { db } from "./db";

export type CalendarItem = {
  date: string; // YYYY-MM-DD
  source: "drive" | "script";
  id: number;
  title: string;
  status: string; // estado real (Drive) o "subido" (script ya publicado con métricas)
  kind: string | null; // 'audio'|'video' (Drive) o formato del guion ('reel'|'youtube')
};

// Todo lo que hay programado/publicado en un rango [from, to) de fechas
// (strings YYYY-MM-DD, comparables lexicográficamente). Junta dos fuentes que
// hoy viven en sitios distintos de la app:
//   1) Archivos del Drive con scheduled_date (lo que TÚ programas a mano).
//   2) Guiones normales ya publicados de verdad (script_metrics.published_at,
//      que ya se rellena en la pestaña Guiones al meter resultados reales).
export function listCalendarItems(userId: number, from: string, to: string): CalendarItem[] {
  const driveRows = db
    .prepare(
      `SELECT df.scheduled_date as date, df.id, df.status, df.kind,
              COALESCE(
                CASE df.linked_type
                  WHEN 'script' THEN (SELECT title FROM scripts WHERE id = df.linked_id)
                  WHEN 'competitor_script' THEN (SELECT title FROM competitor_scripts WHERE id = df.linked_id)
                END,
                df.original_name
              ) as title
       FROM drive_files df
       WHERE df.user_id = ? AND df.scheduled_date IS NOT NULL AND df.scheduled_date >= ? AND df.scheduled_date < ?`
    )
    .all(userId, from, to) as { date: string; id: number; status: string; kind: string; title: string }[];

  const scriptRows = db
    .prepare(
      `SELECT substr(m.published_at, 1, 10) as date, s.id, s.title, s.format
       FROM script_metrics m JOIN scripts s ON s.id = m.script_id
       WHERE s.user_id = ? AND m.published_at IS NOT NULL AND m.published_at >= ? AND m.published_at < ?`
    )
    .all(userId, from, to) as { date: string; id: number; title: string | null; format: string }[];

  const items: CalendarItem[] = [
    ...driveRows.map((r) => ({ date: r.date, source: "drive" as const, id: r.id, title: r.title, status: r.status, kind: r.kind })),
    ...scriptRows.map((r) => ({
      date: r.date,
      source: "script" as const,
      id: r.id,
      title: r.title ?? "(sin título)",
      status: "subido",
      kind: r.format,
    })),
  ];
  return items.sort((a, b) => a.date.localeCompare(b.date));
}
