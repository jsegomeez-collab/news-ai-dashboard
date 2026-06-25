// Carga .env para procesos fuera de Next.js (el worker). Next.js ya lee .env solo.
import { config as loadEnv } from "dotenv";
loadEnv();

function str(key: string, fallback = ""): string {
  return process.env[key]?.trim() || fallback;
}
function num(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) ? v : fallback;
}
function bool(key: string, fallback: boolean): boolean {
  const v = process.env[key]?.trim().toLowerCase();
  if (v === undefined || v === "") return fallback;
  return v === "true" || v === "1" || v === "yes";
}

export const env = {
  anthropicKey: str("ANTHROPIC_API_KEY"),

  modelClassify: str("MODEL_CLASSIFY", "claude-haiku-4-5"),
  modelGenerate: str("MODEL_GENERATE", "claude-sonnet-4-6"),
  modelPremium: str("MODEL_PREMIUM", "claude-opus-4-8"),

  pollCron: str("POLL_CRON", "*/10 * * * *"),
  relevanceThreshold: num("RELEVANCE_THRESHOLD", 70),
  // Umbral por debajo del cual una noticia NO se muestra en el feed (se considera
  // fuera de tema). Las pendientes de clasificar sí se muestran (marcadas "…").
  newsMinRelevance: num("NEWS_MIN_RELEVANCE", 55),
  // Pre-filtro por palabras clave al ingerir: descarta lo que claramente no es IA.
  aiPrefilter: bool("AI_PREFILTER", true),
  generateFormats: str("GENERATE_FORMATS", "reel,youtube")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as ("reel" | "youtube")[],
  useBatchClassify: bool("USE_BATCH_CLASSIFY", true),

  maxScriptsPerDay: num("MAX_SCRIPTS_PER_DAY", 15),
  maxDailyUsd: num("MAX_DAILY_USD", 5),

  redditSubs: str("REDDIT_SUBS", "ClaudeAI,Anthropic,artificial,OpenAI,singularity,LocalLLaMA")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  twitterEnabled: bool("TWITTER_ENABLED", false),
  twitterBearer: str("TWITTER_BEARER_TOKEN"),
};

export function hasApiKey(): boolean {
  return env.anthropicKey.startsWith("sk-ant-");
}

// Precios USD por millón de tokens (input, output). Fuente: skill claude-api.
export const PRICING: Record<string, { in: number; out: number }> = {
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-opus-4-8": { in: 5, out: 25 },
};
