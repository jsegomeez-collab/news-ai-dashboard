// Feeds RSS oficiales y fiables. Edita esta lista a tu gusto.
export const RSS_FEEDS: { name: string; url: string }[] = [
  // Anthropic no publica un RSS oficial estable; se cubre vía Reddit r/Anthropic,
  // Hacker News y blogs de terceros. Añade aquí su URL si publican uno.
  { name: "Google AI Blog", url: "https://blog.google/technology/ai/rss/" },
  { name: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { name: "VentureBeat AI", url: "https://venturebeat.com/category/ai/feed/" },
  { name: "The Verge AI", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
  { name: "MIT Tech Review AI", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed" },
  { name: "Ars Technica AI", url: "https://arstechnica.com/ai/feed/" },
  { name: "Simon Willison", url: "https://simonwillison.net/atom/everything/" },
];

// Términos para filtrar Hacker News (front page) a temas de IA.
export const HN_QUERY_TERMS = [
  "AI",
  "LLM",
  "Claude",
  "Anthropic",
  "OpenAI",
  "GPT",
  "Gemini",
  "agent",
];
