import { db } from "./db";
import { deleteUploadIfExists } from "./uploads";
export { DRIVE_STATUSES, type DriveStatus } from "./driveUi";

export type DriveFolder = {
  id: number;
  user_id: number;
  parent_id: number | null;
  name: string;
  created_at: string;
};

export type DriveFile = {
  id: number;
  user_id: number;
  folder_id: number | null;
  original_name: string;
  path: string;
  mime: string;
  size: number;
  kind: string;
  status: string;
  scheduled_date: string | null;
  linked_type: string | null;
  linked_id: number | null;
  notes: string | null;
  uploaded_at: string;
  linked_title: string | null;
};

// Sub-select correlacionado: el título del guion vinculado (de la tabla que
// corresponda según linked_type), para no tener que hacer una consulta aparte
// por cada archivo solo para mostrar a qué guion pertenece.
const LINK_TITLE_SQL = `
  CASE df.linked_type
    WHEN 'script' THEN (SELECT title FROM scripts WHERE id = df.linked_id)
    WHEN 'competitor_script' THEN (SELECT title FROM competitor_scripts WHERE id = df.linked_id)
    ELSE NULL
  END AS linked_title
`;

// ─── Folders ────────────────────────────────────────────────────────────────

export function listFolders(userId: number, parentId: number | null): DriveFolder[] {
  if (parentId === null) {
    return db
      .prepare(`SELECT * FROM drive_folders WHERE user_id = ? AND parent_id IS NULL ORDER BY name COLLATE NOCASE ASC`)
      .all(userId) as DriveFolder[];
  }
  return db
    .prepare(`SELECT * FROM drive_folders WHERE user_id = ? AND parent_id = ? ORDER BY name COLLATE NOCASE ASC`)
    .all(userId, parentId) as DriveFolder[];
}

export function getFolder(userId: number, folderId: number): DriveFolder | null {
  return (
    (db.prepare(`SELECT * FROM drive_folders WHERE id = ? AND user_id = ?`).get(folderId, userId) as
      | DriveFolder
      | undefined) ?? null
  );
}

export function createFolder(userId: number, name: string, parentId: number | null): number {
  const res = db
    .prepare(`INSERT INTO drive_folders(user_id, parent_id, name, created_at) VALUES(?, ?, ?, ?)`)
    .run(userId, parentId, name.trim().slice(0, 200) || "Carpeta sin nombre", new Date().toISOString());
  return Number(res.lastInsertRowid);
}

export function renameFolder(userId: number, folderId: number, name: string): void {
  db.prepare(`UPDATE drive_folders SET name = ? WHERE id = ? AND user_id = ?`).run(
    name.trim().slice(0, 200) || "Carpeta sin nombre",
    folderId,
    userId
  );
}

// Cadena raíz→actual para las migas de pan.
export function folderBreadcrumb(userId: number, folderId: number | null): DriveFolder[] {
  const chain: DriveFolder[] = [];
  let current = folderId;
  let guard = 0;
  while (current !== null && guard++ < 50) {
    const f = getFolder(userId, current);
    if (!f) break;
    chain.unshift(f);
    current = f.parent_id;
  }
  return chain;
}

function collectFolderIds(userId: number, rootId: number): number[] {
  const all = [rootId];
  let frontier = [rootId];
  let guard = 0;
  while (frontier.length > 0 && guard++ < 200) {
    const placeholders = frontier.map(() => "?").join(",");
    const children = db
      .prepare(`SELECT id FROM drive_folders WHERE user_id = ? AND parent_id IN (${placeholders})`)
      .all(userId, ...frontier) as { id: number }[];
    frontier = children.map((c) => c.id);
    all.push(...frontier);
  }
  return all;
}

// ON DELETE CASCADE limpia las filas (subcarpetas + archivos) de la BD, pero
// no los archivos físicos en disco — hay que recogerlos antes y borrarlos
// después de que el cascade confirme.
export function deleteFolder(userId: number, folderId: number): void {
  const folderIds = collectFolderIds(userId, folderId);
  const placeholders = folderIds.map(() => "?").join(",");
  const files = db
    .prepare(`SELECT path FROM drive_files WHERE user_id = ? AND folder_id IN (${placeholders})`)
    .all(userId, ...folderIds) as { path: string }[];

  db.prepare(`DELETE FROM drive_folders WHERE id = ? AND user_id = ?`).run(folderId, userId);
  for (const { path } of files) deleteUploadIfExists(path);
}

// ─── Files ──────────────────────────────────────────────────────────────────

export function listFiles(userId: number, folderId: number | null): DriveFile[] {
  if (folderId === null) {
    return db
      .prepare(`SELECT df.*, ${LINK_TITLE_SQL} FROM drive_files df WHERE df.user_id = ? AND df.folder_id IS NULL ORDER BY df.uploaded_at DESC`)
      .all(userId) as DriveFile[];
  }
  return db
    .prepare(`SELECT df.*, ${LINK_TITLE_SQL} FROM drive_files df WHERE df.user_id = ? AND df.folder_id = ? ORDER BY df.uploaded_at DESC`)
    .all(userId, folderId) as DriveFile[];
}

export function getFile(userId: number, fileId: number): DriveFile | null {
  return (
    (db
      .prepare(`SELECT df.*, ${LINK_TITLE_SQL} FROM drive_files df WHERE df.id = ? AND df.user_id = ?`)
      .get(fileId, userId) as DriveFile | undefined) ?? null
  );
}

export function createFileRecord(
  userId: number,
  data: {
    folderId: number | null;
    originalName: string;
    path: string;
    mime: string;
    size: number;
    kind: string;
    status?: string;
  }
): number {
  const res = db
    .prepare(
      `INSERT INTO drive_files(user_id, folder_id, original_name, path, mime, size, kind, status, uploaded_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      data.folderId,
      data.originalName,
      data.path,
      data.mime,
      data.size,
      data.kind,
      data.status ?? "por_grabar",
      new Date().toISOString()
    );
  return Number(res.lastInsertRowid);
}

// Carpeta fija donde aterrizan los vídeos que produce el pipeline automático
// (HeyGen + Remotion) — se crea sola la primera vez que hace falta, para no
// mezclar lo generado por IA con lo que el usuario sube a mano en la raíz.
export function ensureGeneratedVideosFolder(userId: number): number {
  const existing = db
    .prepare(`SELECT id FROM drive_folders WHERE user_id = ? AND parent_id IS NULL AND name = ?`)
    .get(userId, "🤖 Vídeos generados") as { id: number } | undefined;
  if (existing) return existing.id;
  return createFolder(userId, "🤖 Vídeos generados", null);
}

// El pipeline automático guarda el MISMO archivo físico en drive_files y en
// content_items (Calendario) — sin esto, borrar la publicación del Calendario
// borraría también el archivo que Drive sigue creyendo que tiene. Drive es
// el dueño real: solo se borra el archivo si NINGÚN drive_file lo referencia.
export function pathOwnedByDrive(path: string): boolean {
  return !!db.prepare(`SELECT 1 FROM drive_files WHERE path = ?`).get(path);
}

export function updateFile(
  userId: number,
  fileId: number,
  patch: {
    status?: string;
    scheduledDate?: string | null;
    linkedType?: string | null;
    linkedId?: number | null;
    notes?: string | null;
  }
): void {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (patch.status !== undefined) { fields.push("status = ?"); values.push(patch.status); }
  if (patch.scheduledDate !== undefined) { fields.push("scheduled_date = ?"); values.push(patch.scheduledDate); }
  if (patch.linkedType !== undefined) { fields.push("linked_type = ?"); values.push(patch.linkedType); }
  if (patch.linkedId !== undefined) { fields.push("linked_id = ?"); values.push(patch.linkedId); }
  if (patch.notes !== undefined) { fields.push("notes = ?"); values.push(patch.notes); }
  if (fields.length === 0) return;
  values.push(fileId, userId);
  db.prepare(`UPDATE drive_files SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).run(...(values as never[]));
}

// Devuelve la ruta en disco (para poder borrarla) o null si no existía/no era tuyo.
export function deleteFile(userId: number, fileId: number): string | null {
  const file = getFile(userId, fileId);
  if (!file) return null;
  db.prepare(`DELETE FROM drive_files WHERE id = ? AND user_id = ?`).run(fileId, userId);
  return file.path;
}

// ¿El guion que se quiere vincular es realmente del usuario? Evita que un
// archivo quede "vinculado" a un guion ajeno colando su id.
export function linkTargetOwnedBy(userId: number, type: string, id: number): boolean {
  if (type === "script") return !!db.prepare(`SELECT 1 FROM scripts WHERE id = ? AND user_id = ?`).get(id, userId);
  if (type === "competitor_script") {
    return !!db.prepare(`SELECT 1 FROM competitor_scripts WHERE id = ? AND user_id = ?`).get(id, userId);
  }
  return false;
}

// ─── Selector "vincular a un guion" ───────────────────────────────────────────

export type LinkTarget = { type: "script" | "competitor_script"; id: number; title: string; format: string };

export function searchLinkTargets(userId: number, query: string): LinkTarget[] {
  const q = `%${query.trim()}%`;
  const own = db
    .prepare(`SELECT id, title, format FROM scripts WHERE user_id = ? AND title LIKE ? ORDER BY created_at DESC LIMIT 10`)
    .all(userId, q) as { id: number; title: string | null; format: string }[];
  const adapted = db
    .prepare(`SELECT id, title, format FROM competitor_scripts WHERE user_id = ? AND title LIKE ? ORDER BY created_at DESC LIMIT 10`)
    .all(userId, q) as { id: number; title: string | null; format: string }[];
  return [
    ...own.map((s) => ({ type: "script" as const, id: s.id, title: s.title ?? "(sin título)", format: s.format })),
    ...adapted.map((s) => ({ type: "competitor_script" as const, id: s.id, title: s.title ?? "(sin título)", format: s.format })),
  ];
}
