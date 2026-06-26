import { db } from "./db";
import { BRAND_KINDS, BRAND_LABEL, type BrandKind } from "./status";

export type SwipeItem = {
  id: number;
  title: string;
  platform: string | null;
  author: string | null;
  content: string;
  why: string | null;
  created_at: string;
};

export function getBrandDocs(userId: number): Record<string, string> {
  const rows = db
    .prepare(`SELECT kind, content FROM brand_docs WHERE user_id = ?`)
    .all(userId) as { kind: string; content: string }[];
  const out: Record<string, string> = {};
  for (const r of rows) out[r.kind] = r.content ?? "";
  return out;
}

export function setBrandDoc(userId: number, kind: BrandKind, content: string): void {
  db.prepare(
    `INSERT INTO brand_docs(user_id, kind, content, updated_at) VALUES(?, ?, ?, ?)
     ON CONFLICT(user_id, kind) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at`
  ).run(userId, kind, content, new Date().toISOString());
}

export function listSwipe(userId: number): SwipeItem[] {
  return db
    .prepare(`SELECT * FROM swipe_files WHERE user_id = ? ORDER BY created_at DESC`)
    .all(userId) as SwipeItem[];
}
export function addSwipe(userId: number, s: Omit<SwipeItem, "id" | "created_at">): number {
  const res = db
    .prepare(
      `INSERT INTO swipe_files(user_id, title, platform, author, content, why, created_at)
       VALUES(?, ?, ?, ?, ?, ?, ?)`
    )
    .run(userId, s.title, s.platform ?? null, s.author ?? null, s.content, s.why ?? null, new Date().toISOString());
  return Number(res.lastInsertRowid);
}
export function deleteSwipe(userId: number, id: number): void {
  db.prepare(`DELETE FROM swipe_files WHERE id = ? AND user_id = ?`).run(id, userId);
}

export function topPerformers(userId: number, limit = 5): {
  title: string;
  format: string;
  hook: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  new_followers: number;
}[] {
  return db
    .prepare(
      `SELECT s.title, s.format, s.hook, m.views, m.likes, m.comments, m.shares, m.new_followers
       FROM script_metrics m JOIN scripts s ON s.id = m.script_id
       WHERE s.user_id = ?
       ORDER BY (m.views + m.likes*3 + m.comments*5 + m.shares*8 + m.new_followers*20) DESC
       LIMIT ?`
    )
    .all(userId, limit) as never;
}

export type BrainContext = { combined: string; tonalidad: string; hash: string };

export function buildBrain(userId: number): BrainContext {
  const docs = getBrandDocs(userId);
  const swipe = listSwipe(userId);
  const top = topPerformers(userId);

  const dbBases = BRAND_KINDS.filter((k) => k !== "tonalidad" && docs[k]?.trim())
    .map((k) => `### ${BRAND_LABEL[k]}\n${docs[k]}`)
    .join("\n\n");

  const tonalidad = (docs["tonalidad"] ?? "").trim();

  const swipeText = swipe.length
    ? swipe
        .map(
          (s, i) =>
            `EJEMPLO ${i + 1} — ${s.title}${s.platform ? ` [${s.platform}]` : ""}\n` +
            `${s.content}${s.why ? `\n(Por qué funcionó: ${s.why})` : ""}`
        )
        .join("\n\n")
    : "";

  const topText = top.length
    ? top
        .map(
          (t, i) =>
            `TUYO ${i + 1} (${t.format}) — ${t.title}\nGancho: ${t.hook}\n` +
            `Métricas: ${t.views} views, ${t.likes} likes, ${t.comments} coment., ${t.shares} comp., +${t.new_followers} seguidores`
        )
        .join("\n\n")
    : "";

  const combined = [
    dbBases && `## BASES DE NEGOCIO\n${dbBases}`,
    tonalidad && `## TONALIDAD Y FORMA DE HABLAR\n${tonalidad}`,
    swipeText && `## QUÉ FUNCIONA EN LA COMPETENCIA (swipe file — replica el patrón, no copies literal)\n${swipeText}`,
    topText && `## TUS GUIONES QUE MÁS FUNCIONARON (replica lo que ya te dio resultados)\n${topText}`,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  const stamp = JSON.stringify({
    d: getBrandDocsStamp(userId),
    s: swipe.map((x) => x.id).join(","),
    t: top.length,
  });

  return {
    combined: combined || "(Sin contexto de marca todavía: rellena tus bases en la pestaña Marca.)",
    tonalidad,
    hash: simpleHash(stamp),
  };
}

function getBrandDocsStamp(userId: number): string {
  const row = db
    .prepare(`SELECT MAX(updated_at) m FROM brand_docs WHERE user_id = ?`)
    .get(userId) as { m: string | null };
  return row?.m ?? "";
}
function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}
