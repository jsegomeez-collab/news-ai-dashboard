import { db } from "./db";
import { deleteUploadIfExists } from "./uploads";

export type MediaSlot = "audio" | "video";

export type ContentItem = {
  id: number;
  user_id: number;
  linked_type: string | null;
  linked_id: number | null;
  title: string | null;
  status: string;
  scheduled_date: string;
  audio_path: string | null;
  audio_original_name: string | null;
  audio_mime: string | null;
  audio_size: number | null;
  video_path: string | null;
  video_original_name: string | null;
  video_mime: string | null;
  video_size: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  linked_title: string | null;
};

const LINK_TITLE_SQL = `
  CASE ci.linked_type
    WHEN 'script' THEN (SELECT title FROM scripts WHERE id = ci.linked_id)
    WHEN 'competitor_script' THEN (SELECT title FROM competitor_scripts WHERE id = ci.linked_id)
    ELSE NULL
  END AS linked_title
`;

export function listContentItemsInRange(userId: number, from: string, to: string): ContentItem[] {
  return db
    .prepare(
      `SELECT ci.*, ${LINK_TITLE_SQL} FROM content_items ci
       WHERE ci.user_id = ? AND ci.scheduled_date >= ? AND ci.scheduled_date < ?
       ORDER BY ci.scheduled_date ASC`
    )
    .all(userId, from, to) as ContentItem[];
}

export function getContentItem(userId: number, id: number): ContentItem | null {
  return (
    (db
      .prepare(`SELECT ci.*, ${LINK_TITLE_SQL} FROM content_items ci WHERE ci.id = ? AND ci.user_id = ?`)
      .get(id, userId) as ContentItem | undefined) ?? null
  );
}

// Para la vista "Pipeline" de /calendario: todas las publicaciones del
// usuario sin acotar por fecha, para verlas agrupadas por estado (por_grabar,
// editando...) sin importar cuándo estén programadas.
export function listAllContentItems(userId: number): ContentItem[] {
  return db
    .prepare(
      `SELECT ci.*, ${LINK_TITLE_SQL} FROM content_items ci
       WHERE ci.user_id = ?
       ORDER BY ci.scheduled_date ASC`
    )
    .all(userId) as ContentItem[];
}

// Para saber, desde /adaptados, si un guion concreto ya tiene una publicación
// programada en el calendario (y con qué fecha/estado) antes de abrir el popup.
export function listContentItemsByLink(userId: number, linkedType: string, linkedId: number): ContentItem[] {
  return db
    .prepare(
      `SELECT ci.*, ${LINK_TITLE_SQL} FROM content_items ci
       WHERE ci.user_id = ? AND ci.linked_type = ? AND ci.linked_id = ?
       ORDER BY ci.scheduled_date ASC`
    )
    .all(userId, linkedType, linkedId) as ContentItem[];
}

export function createContentItem(
  userId: number,
  data: { linkedType?: string | null; linkedId?: number | null; title?: string | null; scheduledDate: string; status?: string }
): number {
  const now = new Date().toISOString();
  const res = db
    .prepare(
      `INSERT INTO content_items(user_id, linked_type, linked_id, title, status, scheduled_date, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      data.linkedType ?? null,
      data.linkedId ?? null,
      data.title?.trim() || null,
      data.status ?? "por_grabar",
      data.scheduledDate,
      now,
      now
    );
  return Number(res.lastInsertRowid);
}

export function updateContentItem(
  userId: number,
  id: number,
  patch: {
    status?: string;
    scheduledDate?: string;
    linkedType?: string | null;
    linkedId?: number | null;
    title?: string | null;
    notes?: string | null;
  }
): void {
  const fields: string[] = ["updated_at = ?"];
  const values: unknown[] = [new Date().toISOString()];
  if (patch.status !== undefined) { fields.push("status = ?"); values.push(patch.status); }
  if (patch.scheduledDate !== undefined) { fields.push("scheduled_date = ?"); values.push(patch.scheduledDate); }
  if (patch.linkedType !== undefined) { fields.push("linked_type = ?"); values.push(patch.linkedType); }
  if (patch.linkedId !== undefined) { fields.push("linked_id = ?"); values.push(patch.linkedId); }
  if (patch.title !== undefined) { fields.push("title = ?"); values.push(patch.title?.trim() || null); }
  if (patch.notes !== undefined) { fields.push("notes = ?"); values.push(patch.notes); }
  values.push(id, userId);
  db.prepare(`UPDATE content_items SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).run(...(values as never[]));
}

// Guarda (o reemplaza) el archivo de un slot ('audio' o 'video'). Si ya había
// uno, lo borra del disco DESPUÉS de confirmar el nuevo en BD.
export function setContentItemMedia(
  userId: number,
  id: number,
  slot: MediaSlot,
  media: { path: string; originalName: string; mime: string; size: number }
): string | null {
  const current = getContentItem(userId, id);
  if (!current) return null;
  const previous = slot === "audio" ? current.audio_path : current.video_path;

  db.prepare(
    `UPDATE content_items SET ${slot}_path = ?, ${slot}_original_name = ?, ${slot}_mime = ?, ${slot}_size = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(media.path, media.originalName, media.mime, media.size, new Date().toISOString(), id, userId);

  return previous;
}

export function clearContentItemMedia(userId: number, id: number, slot: MediaSlot): string | null {
  const current = getContentItem(userId, id);
  if (!current) return null;
  const previous = slot === "audio" ? current.audio_path : current.video_path;
  if (!previous) return null;
  db.prepare(
    `UPDATE content_items SET ${slot}_path = NULL, ${slot}_original_name = NULL, ${slot}_mime = NULL, ${slot}_size = NULL, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(new Date().toISOString(), id, userId);
  return previous;
}

// Borra el item y ambos archivos (audio+video) del disco si existían.
export function deleteContentItem(userId: number, id: number): boolean {
  const current = getContentItem(userId, id);
  if (!current) return false;
  db.prepare(`DELETE FROM content_items WHERE id = ? AND user_id = ?`).run(id, userId);
  deleteUploadIfExists(current.audio_path);
  deleteUploadIfExists(current.video_path);
  return true;
}

export function linkTargetOwnedBy(userId: number, type: string, id: number): boolean {
  if (type === "script") return !!db.prepare(`SELECT 1 FROM scripts WHERE id = ? AND user_id = ?`).get(id, userId);
  if (type === "competitor_script") {
    return !!db.prepare(`SELECT 1 FROM competitor_scripts WHERE id = ? AND user_id = ?`).get(id, userId);
  }
  return false;
}
