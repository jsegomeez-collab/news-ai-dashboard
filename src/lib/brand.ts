import { db } from "./db";
import { loadKnowledge } from "./knowledge";
import { BRAND_KINDS, BRAND_LABEL, type BrandKind } from "./status";

export type BrandDoc = { kind: BrandKind; content: string; updated_at: string | null };
export type SwipeItem = {
  id: number;
  title: string;
  platform: string | null;
  author: string | null;
  content: string;
  why: string | null;
  created_at: string;
};

export function getBrandDocs(): Record<string, string> {
  const rows = db.prepare(`SELECT kind, content FROM brand_docs`).all() as {
    kind: string;
    content: string;
  }[];
  const out: Record<string, string> = {};
  for (const r of rows) out[r.kind] = r.content ?? "";
  return out;
}

export function setBrandDoc(kind: BrandKind, content: string): void {
  db.prepare(
    `INSERT INTO brand_docs(kind, content, updated_at) VALUES(?, ?, ?)
     ON CONFLICT(kind) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at`
  ).run(kind, content, new Date().toISOString());
}

export function listSwipe(): SwipeItem[] {
  return db
    .prepare(`SELECT * FROM swipe_files ORDER BY created_at DESC`)
    .all() as SwipeItem[];
}
export function addSwipe(s: Omit<SwipeItem, "id" | "created_at">): number {
  const res = db
    .prepare(
      `INSERT INTO swipe_files(title, platform, author, content, why, created_at)
       VALUES(?, ?, ?, ?, ?, ?)`
    )
    .run(s.title, s.platform ?? null, s.author ?? null, s.content, s.why ?? null, new Date().toISOString());
  return Number(res.lastInsertRowid);
}
export function deleteSwipe(id: number): void {
  db.prepare(`DELETE FROM swipe_files WHERE id = ?`).run(id);
}

// Tus guiones que mejor funcionaron (con métricas), para que Claude replique patrones.
export function topPerformers(limit = 5): {
  title: string;
  format: string;
  hook: string;
  body: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  new_followers: number;
}[] {
  return db
    .prepare(
      `SELECT s.title, s.format, s.hook, s.body,
              m.views, m.likes, m.comments, m.shares, m.new_followers
       FROM script_metrics m JOIN scripts s ON s.id = m.script_id
       ORDER BY (m.views + m.likes*3 + m.comments*5 + m.shares*8 + m.new_followers*20) DESC
       LIMIT ?`
    )
    .all(limit) as never;
}

export type BrainContext = {
  combined: string;
  tonalidad: string;
  hash: string;
};

// Ensambla TODO el conocimiento: archivos /knowledge + bases editables (BD) +
// swipe file de competencia + tus guiones que funcionaron.
export async function buildBrain(): Promise<BrainContext> {
  const file = await loadKnowledge();
  const docs = getBrandDocs();
  const swipe = listSwipe();
  const top = topPerformers();

  const dbBases = BRAND_KINDS.filter((k) => k !== "tonalidad" && docs[k]?.trim())
    .map((k) => `### ${BRAND_LABEL[k]}\n${docs[k]}`)
    .join("\n\n");

  const tonalidad = [file.tonalidad, docs["tonalidad"]].filter(Boolean).join("\n\n");

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
    file.combined,
    dbBases && `## BASES DE NEGOCIO (editadas en la app)\n${dbBases}`,
    tonalidad && `## TONALIDAD Y FORMA DE HABLAR\n${tonalidad}`,
    swipeText &&
      `## QUÉ FUNCIONA EN LA COMPETENCIA (swipe file — replica el patrón, no copies literal)\n${swipeText}`,
    topText && `## TUS GUIONES QUE MÁS FUNCIONARON (replica lo que ya te dio resultados)\n${topText}`,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  // Hash para caché: archivos + sellos de tiempo de la BD.
  const stamp = JSON.stringify({
    f: file.hash,
    d: getBrandDocsStamp(),
    s: swipe.map((s) => s.id).join(","),
    t: top.length,
  });
  const hash = simpleHash(stamp);

  return { combined: combined || "(Sin contexto de marca todavía.)", tonalidad, hash };
}

function getBrandDocsStamp(): string {
  const row = db.prepare(`SELECT MAX(updated_at) m FROM brand_docs`).get() as { m: string | null };
  return row?.m ?? "";
}
function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}
