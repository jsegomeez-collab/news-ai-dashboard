export type RawArticle = {
  source: string;
  url: string;
  title: string;
  summary?: string;
  publishedAt?: string; // ISO
  raw?: unknown;
};
