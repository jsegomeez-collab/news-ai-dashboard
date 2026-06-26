import type { RawArticle } from "./types";
import { HN_QUERY_TERMS } from "./feeds";

type HnHit = {
  objectID: string;
  title: string;
  url: string | null;
  story_text: string | null;
  points: number;
  created_at: string;
};

// Usa la API de Algolia de Hacker News: historias recientes con puntuación
// que mencionan términos de IA.
export async function fetchHackerNews(): Promise<RawArticle[]> {
  const out: RawArticle[] = [];
  const seen = new Set<string>();
  for (const term of HN_QUERY_TERMS) {
    try {
      const res = await fetch(
        `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(
          term
        )}&tags=story&numericFilters=points>10&hitsPerPage=30`
      );
      if (!res.ok) continue;
      const json = (await res.json()) as { hits: HnHit[] };
      for (const hit of json.hits) {
        if (!hit.title || seen.has(hit.objectID)) continue;
        seen.add(hit.objectID);
        out.push({
          source: "hackernews",
          url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
          title: hit.title,
          summary: (hit.story_text || "").replace(/<[^>]+>/g, " ").slice(0, 600),
          publishedAt: hit.created_at,
          raw: { points: hit.points },
        });
      }
    } catch (e) {
      console.warn(`[hn] error en "${term}":`, (e as Error).message);
    }
  }
  return out;
}
