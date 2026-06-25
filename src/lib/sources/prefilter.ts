import type { RawArticle } from "./types";

// Pre-filtro barato (sin IA): solo deja pasar artículos que mencionan IA o temas
// claramente relacionados. Es permisivo en lo que SÍ es IA (para no perder nada
// relevante); la precisión fina "negocio/innovador/nuevo" la pone el clasificador.
const AI_TERMS = [
  "ai", "a.i.", "artificial intelligence", "inteligencia artificial",
  "llm", "gpt", "chatgpt", "claude", "anthropic", "openai", "gemini",
  "mistral", "llama", "grok", "deepseek", "qwen", "copilot", "perplexity",
  "machine learning", "deep learning", "neural", "transformer", "model",
  "modelo", "agent", "agente", "rag", "fine-tun", "embedding", "diffusion",
  "midjourney", "stable diffusion", "hugging face", "nvidia", "inference",
  "prompt", "multimodal", "automation", "automatizaci", "chatbot",
];

// Señales de "ruido" frecuente que, sin un término de IA fuerte, se descarta.
const HARD_NOISE = [
  "crossword", "recipe", "horoscope", "celebrity", "nfl", "nba", "soccer",
];

function text(a: RawArticle): string {
  return `${a.title} ${a.summary ?? ""}`.toLowerCase();
}

export function isAiRelated(a: RawArticle): boolean {
  const t = text(a);
  const hasAi = AI_TERMS.some((term) => t.includes(term));
  if (!hasAi) return false;
  // Si solo tiene un término débil ("model"/"agent") y además es claramente ruido, fuera.
  if (HARD_NOISE.some((n) => t.includes(n))) return false;
  return true;
}

export function prefilterAi(items: RawArticle[]): RawArticle[] {
  return items.filter(isAiRelated);
}
