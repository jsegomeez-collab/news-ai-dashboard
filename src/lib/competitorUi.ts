// Constantes de UI compartidas entre /competencia y /adaptados.
export const PLATFORM_ICON: Record<string, string> = { tiktok: "🎵", instagram: "📸", youtube: "▶️" };
export const PLATFORM_LABEL: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" };

export const SCRIPT_STATUS_LABEL: Record<string, string> = {
  borrador: "Borrador",
  aprobado: "Aprobado",
  pend_grabar: "Pend. grabar",
  pend_edicion: "Pend. edición",
  pend_subida: "Pend. subida",
  subido: "Subido",
  descartado: "Descartado",
};

export function fmt(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}
