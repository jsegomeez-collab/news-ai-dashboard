import { db } from "./db";

export type PublishNetwork = "instagram" | "tiktok" | "youtube";

export type PublishAccount = {
  id: number;
  user_id: number;
  blog_id: string;
  label: string;
  network: PublishNetwork;
  active: number;
  created_at: string;
};

export function listPublishAccounts(userId: number): PublishAccount[] {
  return db
    .prepare(`SELECT * FROM publish_accounts WHERE user_id = ? ORDER BY created_at DESC`)
    .all(userId) as PublishAccount[];
}

export function listActivePublishAccounts(userId: number): PublishAccount[] {
  return db
    .prepare(`SELECT * FROM publish_accounts WHERE user_id = ? AND active = 1 ORDER BY created_at ASC`)
    .all(userId) as PublishAccount[];
}

export function createPublishAccount(
  userId: number,
  data: { blogId: string; label: string; network: PublishNetwork }
): number {
  const res = db
    .prepare(
      `INSERT INTO publish_accounts(user_id, blog_id, label, network, created_at) VALUES(?, ?, ?, ?, ?)`
    )
    .run(userId, data.blogId.trim(), data.label.trim(), data.network, new Date().toISOString());
  return Number(res.lastInsertRowid);
}

export function updatePublishAccount(userId: number, id: number, data: { active?: boolean; label?: string }): void {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.active !== undefined) { fields.push("active = ?"); values.push(data.active ? 1 : 0); }
  if (data.label !== undefined) { fields.push("label = ?"); values.push(data.label.trim()); }
  if (fields.length === 0) return;
  values.push(id, userId);
  db.prepare(`UPDATE publish_accounts SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).run(...(values as never[]));
}

export function deletePublishAccount(userId: number, id: number): void {
  db.prepare(`DELETE FROM publish_accounts WHERE id = ? AND user_id = ?`).run(id, userId);
}
