// Estados del pipeline de guiones (en orden de flujo).
export const SCRIPT_STATUSES = [
  "borrador",
  "aprobado",
  "pend_grabar",
  "audio_grabado",
  "pend_edicion",
  "pend_subida",
  "subido",
  "descartado",
] as const;

export type ScriptStatus = (typeof SCRIPT_STATUSES)[number];

export const STATUS_LABEL: Record<ScriptStatus, string> = {
  borrador: "Borrador (IA)",
  aprobado: "Aprobado",
  pend_grabar: "Pendiente de grabar",
  audio_grabado: "Audio grabado",
  pend_edicion: "Pendiente de edición",
  pend_subida: "Pendiente de subida",
  subido: "Subido",
  descartado: "Descartado",
};

export const STATUS_COLOR: Record<ScriptStatus, string> = {
  borrador: "#5b8cff",
  aprobado: "#10b981",
  pend_grabar: "#f59e0b",
  audio_grabado: "#14b8a6",
  pend_edicion: "#a855f7",
  pend_subida: "#06b6d4",
  subido: "#22c55e",
  descartado: "#6b7280",
};

export function isStatus(s: string): s is ScriptStatus {
  return (SCRIPT_STATUSES as readonly string[]).includes(s);
}

export const BRAND_KINDS = [
  "problema",
  "cliente-ideal",
  "oferta",
  "competencia",
  "tonalidad",
  "historia",
] as const;
export type BrandKind = (typeof BRAND_KINDS)[number];

export const BRAND_LABEL: Record<BrandKind, string> = {
  problema: "Problema",
  "cliente-ideal": "Cliente ideal",
  oferta: "Oferta",
  competencia: "Análisis de competencia",
  tonalidad: "Tonalidad / forma de hablar",
  historia: "Historia y marca",
};

export const BRAND_HINT: Record<BrandKind, string> = {
  problema: "¿Qué problema real resuelves? El dolor de tu cliente.",
  "cliente-ideal": "¿A quién le hablas? Perfil, deseos, objeciones.",
  oferta: "¿Qué vendes? Promesa, formato, precio, garantía.",
  competencia: "Quién más juega en tu nicho y cómo te diferencias (peso secundario).",
  tonalidad: "Ejemplos de tu forma de hablar: frases, muletillas, ritmo, transcripciones.",
  historia: "Tu historia y la de tu marca: de dónde vienes, tu porqué.",
};
