import { randomBytes } from "node:crypto";
import { db } from "./db";
import { buildScriptText } from "./scriptText";

export type SharedLinkItem = { type: "script" | "competitor_script"; id: number };

export type SharedLinkSummary = {
  id: number;
  token: string;
  title: string | null;
  count: number;
  created_at: string;
};

export type SharedScriptContent = { title: string; text: string };

export function createSharedLink(userId: number, items: SharedLinkItem[], title?: string | null): string {
  const token = randomBytes(16).toString("hex");
  db.prepare(
    `INSERT INTO shared_links(user_id, token, title, items, created_at) VALUES(?, ?, ?, ?, ?)`
  ).run(userId, token, title?.trim() || null, JSON.stringify(items), new Date().toISOString());
  return token;
}

export function listSharedLinks(userId: number): SharedLinkSummary[] {
  const rows = db
    .prepare(`SELECT id, token, title, items, created_at FROM shared_links WHERE user_id = ? ORDER BY created_at DESC`)
    .all(userId) as { id: number; token: string; title: string | null; items: string; created_at: string }[];
  return rows.map((r) => ({
    id: r.id,
    token: r.token,
    title: r.title,
    created_at: r.created_at,
    count: (JSON.parse(r.items) as SharedLinkItem[]).length,
  }));
}

// Pública: solo por token, sin userId. Los guiones se releen con el user_id
// dueño del enlace (nunca el del visitante, que no existe) para que el JSON
// de "items" no pueda usarse para leer guiones de otro usuario.
export function getSharedLinkContent(token: string): { title: string | null; scripts: SharedScriptContent[] } | null {
  const row = db
    .prepare(`SELECT user_id, title, items FROM shared_links WHERE token = ?`)
    .get(token) as { user_id: number; title: string | null; items: string } | undefined;
  if (!row) return null;

  const items = JSON.parse(row.items) as SharedLinkItem[];
  const scripts: SharedScriptContent[] = [];
  for (const it of items) {
    if (it.type === "script") {
      const s = db
        .prepare(`SELECT title, hook, body, cta FROM scripts WHERE id = ? AND user_id = ?`)
        .get(it.id, row.user_id) as { title: string | null; hook: string | null; body: string | null; cta: string | null } | undefined;
      if (s) scripts.push({ title: s.title || "Sin título", text: buildScriptText(s) });
    } else {
      const s = db
        .prepare(`SELECT title, hook, puente, body, cta FROM competitor_scripts WHERE id = ? AND user_id = ?`)
        .get(it.id, row.user_id) as
        | { title: string | null; hook: string | null; puente: string | null; body: string | null; cta: string | null }
        | undefined;
      if (s) scripts.push({ title: s.title || "Sin título", text: buildScriptText(s) });
    }
  }
  return { title: row.title, scripts };
}
