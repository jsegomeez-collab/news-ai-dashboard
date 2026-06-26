import Parser from "rss-parser";
import type { RawArticle } from "./types";
import { RSS_FEEDS } from "./feeds";

const parser = new Parser({ timeout: 15000 });

function stripHtml(s: string | undefined): string {
  if (!s) return "";
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

export async function fetchRss(): Promise<RawArticle[]> {
  const out: RawArticle[] = [];
  await Promise.all(
    RSS_FEEDS.map(async (feed) => {
      try {
        const parsed = await parser.parseURL(feed.url);
        for (const item of parsed.items.slice(0, 40)) {
          if (!item.link || !item.title) continue;
          out.push({
            source: `rss/${feed.name}`,
            url: item.link,
            title: item.title,
            summary: stripHtml(item.contentSnippet || item.content),
            publishedAt: item.isoDate || item.pubDate,
          });
        }
      } catch (e) {
        console.warn(`[rss] error en ${feed.name}:`, (e as Error).message);
      }
    })
  );
  return out;
}
