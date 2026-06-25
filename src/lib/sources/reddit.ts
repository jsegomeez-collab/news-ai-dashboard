import type { RawArticle } from "./types";
import { env } from "../env";

type RedditChild = {
  data: {
    title: string;
    permalink: string;
    url: string;
    selftext?: string;
    created_utc: number;
    subreddit: string;
    score: number;
    stickied?: boolean;
  };
};

// Lee los posts "hot" de cada subreddit vía el endpoint JSON público.
export async function fetchReddit(): Promise<RawArticle[]> {
  const out: RawArticle[] = [];
  // Reddit bloquea peticiones sin OAuth desde IPs de datacenter (403). Desde una
  // IP residencial (tu PC) suele funcionar con un User-Agent descriptivo.
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ai-actualidad/0.1 (dashboard personal)";
  for (const sub of env.redditSubs) {
    try {
      const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=15`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
      });
      if (!res.ok) {
        if (res.status === 403) {
          console.warn(
            `[reddit] r/${sub} -> 403 (Reddit bloquea esta IP sin OAuth; suele funcionar en tu equipo local)`
          );
        } else {
          console.warn(`[reddit] r/${sub} -> HTTP ${res.status}`);
        }
        continue;
      }
      const json = (await res.json()) as { data: { children: RedditChild[] } };
      for (const child of json.data.children) {
        const d = child.data;
        if (d.stickied) continue;
        out.push({
          source: `reddit/${d.subreddit}`,
          url: `https://www.reddit.com${d.permalink}`,
          title: d.title,
          summary: (d.selftext || "").slice(0, 600),
          publishedAt: new Date(d.created_utc * 1000).toISOString(),
          raw: { score: d.score, externalUrl: d.url },
        });
      }
    } catch (e) {
      console.warn(`[reddit] error en r/${sub}:`, (e as Error).message);
    }
  }
  return out;
}
