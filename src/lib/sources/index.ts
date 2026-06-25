import { db } from "../db";
import { env } from "../env";
import type { RawArticle } from "./types";
import { fetchReddit } from "./reddit";
import { fetchRss } from "./rss";
import { fetchHackerNews } from "./hackernews";
import { fetchTwitter } from "./twitter";
import { prefilterAi } from "./prefilter";

// Recoge de todas las fuentes, deduplica por URL e inserta los nuevos.
// Devuelve cuántos artículos nuevos se insertaron.
export async function pollAllSources(): Promise<{ fetched: number; inserted: number }> {
  const results = await Promise.allSettled([
    fetchReddit(),
    fetchRss(),
    fetchHackerNews(),
    fetchTwitter(),
  ]);

  const all: RawArticle[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
    else console.warn("[sources] fuente falló:", r.reason?.message ?? r.reason);
  }

  // Capa 1: pre-filtro de IA (descarta lo que claramente no es IA).
  const filtered = env.aiPrefilter ? prefilterAi(all) : all;

  // Dedup dentro del lote por URL.
  const byUrl = new Map<string, RawArticle>();
  for (const a of filtered) {
    if (a.url && a.title && !byUrl.has(a.url)) byUrl.set(a.url, a);
  }

  const insert = db.prepare(
    `INSERT OR IGNORE INTO articles(source, url, title, summary, published_at, fetched_at, raw_json)
     VALUES(@source, @url, @title, @summary, @published_at, @fetched_at, @raw_json)`
  );
  const now = new Date().toISOString();
  let inserted = 0;
  const tx = db.transaction((items: RawArticle[]) => {
    for (const a of items) {
      const res = insert.run({
        source: a.source,
        url: a.url,
        title: a.title,
        summary: a.summary ?? null,
        published_at: a.publishedAt ?? null,
        fetched_at: now,
        raw_json: a.raw ? JSON.stringify(a.raw) : null,
      });
      if (res.changes > 0) inserted++;
    }
  });
  tx([...byUrl.values()]);

  return { fetched: byUrl.size, inserted };
}
