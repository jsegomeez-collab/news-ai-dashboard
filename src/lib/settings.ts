import { getSetting, setSetting } from "./db";
import { env } from "./env";

// Ajustes que se pueden cambiar desde el frontend (anulan los de .env).
// La generación de guiones usa OPUS por defecto.

export function getGenModel(): string {
  return getSetting("gen_model") || env.modelPremium; // claude-opus-4-8
}
export function getAutoGenerate(): boolean {
  const v = getSetting("auto_generate");
  if (v === null) return true;
  return v === "true";
}
export function getRelevanceThreshold(): number {
  const v = getSetting("relevance_threshold");
  const n = v !== null ? Number(v) : env.relevanceThreshold;
  return Number.isFinite(n) ? n : env.relevanceThreshold;
}
export function getFormats(): ("reel" | "youtube")[] {
  const v = getSetting("formats");
  const raw = v || env.generateFormats.join(",");
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is "reel" | "youtube" => s === "reel" || s === "youtube");
}

export type EditableSettings = {
  genModel: string;
  autoGenerate: boolean;
  relevanceThreshold: number;
  formats: ("reel" | "youtube")[];
};

export function readSettings(): EditableSettings {
  return {
    genModel: getGenModel(),
    autoGenerate: getAutoGenerate(),
    relevanceThreshold: getRelevanceThreshold(),
    formats: getFormats(),
  };
}

export function writeSettings(patch: Partial<EditableSettings>): EditableSettings {
  if (patch.genModel) setSetting("gen_model", patch.genModel);
  if (patch.autoGenerate !== undefined) setSetting("auto_generate", String(patch.autoGenerate));
  if (patch.relevanceThreshold !== undefined)
    setSetting("relevance_threshold", String(patch.relevanceThreshold));
  if (patch.formats) setSetting("formats", patch.formats.join(","));
  return readSettings();
}

export const GEN_MODEL_OPTIONS = [
  { id: "claude-opus-4-8", label: "Opus 4.8 (máxima calidad)" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 (equilibrado, más barato)" },
];
