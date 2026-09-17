import { db } from "./db";

export type CalendarItem = {
  date: string; // YYYY-MM-DD
  source: "content" | "drive" | "script";
  id: number;
  title: string;
  status: string; // estado real (content/drive) o "subido" (script ya publicado con métricas)
  kind: string | null; // 'audio'|'video' (drive) o formato del guion (script); null para content
  hasAudio: boolean;
  hasVideo: boolean;
  // HH:mm (UTC) solo para content_items auto-programados por el pipeline de
  // HeyGen (ver autoSchedule.ts) — null en todo lo demás (creado a mano, o
  // fuentes que no tienen hora, como drive/script).
  time: string | null;
};

// Todo lo que hay programado/publicado en un rango [from, to) de fechas
// (strings YYYY-MM-DD, comparables lexicográficamente). Tres fuentes que
// viven en sitios distintos de la app, unificadas aquí:
//   1) content_items: publicaciones creadas desde el "+" del calendario
//      (guion + audio + video clonado + fecha + estado, todo junto).
//   2) drive_files con scheduled_date: archivos sueltos programados a mano
//      desde el propio Drive.
//   3) Guiones normales ya publicados de verdad (script_metrics.published_at).
export function listCalendarItems(userId: number, from: string, to: string): CalendarItem[] {
  const contentRows = db
    .prepare(
      `SELECT ci.scheduled_date as date, ci.scheduled_time as time, ci.id, ci.status, ci.audio_path, ci.video_path,
              COALESCE(
                ci.title,
                CASE ci.linked_type
                  WHEN 'script' THEN (SELECT title FROM scripts WHERE id = ci.linked_id)
                  WHEN 'competitor_script' THEN (SELECT title FROM competitor_scripts WHERE id = ci.linked_id)
                END
              ) as title
       FROM content_items ci
       WHERE ci.user_id = ? AND ci.scheduled_date >= ? AND ci.scheduled_date < ?`
    )
    .all(userId, from, to) as { date: string; time: string | null; id: number; status: string; audio_path: string | null; video_path: string | null; title: string | null }[];

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
    ...contentRows.map((r) => ({
      date: r.date,
      source: "content" as const,
      id: r.id,
      title: r.title ?? "(sin título)",
      status: r.status,
      kind: null,
      hasAudio: !!r.audio_path,
      hasVideo: !!r.video_path,
      time: r.time,
    })),
    ...driveRows.map((r) => ({
      date: r.date,
      source: "drive" as const,
      id: r.id,
      title: r.title,
      status: r.status,
      kind: r.kind,
      hasAudio: false,
      hasVideo: false,
      time: null,
    })),
    ...scriptRows.map((r) => ({
      date: r.date,
      source: "script" as const,
      id: r.id,
      title: r.title ?? "(sin título)",
      status: "subido",
      kind: r.format,
      hasAudio: false,
      hasVideo: false,
      time: null,
    })),
  ];
  return items.sort((a, b) => a.date.localeCompare(b.date));
}
