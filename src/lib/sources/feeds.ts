// Feeds RSS directos (oficiales y de medios fiables). Edita la lista a tu gusto.
const DIRECT_FEEDS: { name: string; url: string }[] = [
  { name: "Google AI Blog", url: "https://blog.google/technology/ai/rss/" },
  { name: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { name: "VentureBeat AI", url: "https://venturebeat.com/category/ai/feed/" },
  { name: "The Verge AI", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
  { name: "MIT Tech Review AI", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed" },
  { name: "Ars Technica AI", url: "https://arstechnica.com/ai/feed/" },
  { name: "Simon Willison", url: "https://simonwillison.net/atom/everything/" },
  { name: "AI Business", url: "https://aibusiness.com/rss.xml" },
  { name: "MarkTechPost", url: "https://www.marktechpost.com/feed/" },
  { name: "The Decoder", url: "https://the-decoder.com/feed/" },
];

// Google News RSS por búsqueda: devuelve MUCHAS noticias frescas y rotan a
// menudo (gran caudal para que el pool crezca). Enfocadas a tu nicho:
// IA + negocios digitales + novedades.
const GOOGLE_NEWS_QUERIES = [
  "inteligencia artificial negocios",
  "inteligencia artificial empresas",
  "IA marketing",
  "inteligencia artificial emprendedores",
  "Claude Anthropic IA",
  "OpenAI ChatGPT",
  "AI agents business",
  "AI marketing tools",
  "AI startup",
  "herramientas de inteligencia artificial",
  "automatización con IA",
  "nuevos modelos de IA",
];

function googleNewsFeeds(): { name: string; url: string }[] {
  return GOOGLE_NEWS_QUERIES.map((q) => ({
    name: `GNews: ${q}`,
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:7d")}&hl=es-419&gl=ES&ceid=ES:es`,
  }));
}

export const RSS_FEEDS: { name: string; url: string }[] = [
  ...DIRECT_FEEDS,
  ...googleNewsFeeds(),
];

// Términos para buscar en Hacker News (Algolia).
export const HN_QUERY_TERMS = [
  "AI",
  "LLM",
  "Claude",
  "Anthropic",
  "OpenAI",
  "GPT",
  "Gemini",
  "agent",
  "machine learning",
  "AI startup",
];
