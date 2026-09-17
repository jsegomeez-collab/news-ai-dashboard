// Constantes de UI compartidas entre /competencia y /adaptados.
export const PLATFORM_ICON: Record<string, string> = { tiktok: "🎵", instagram: "📸", youtube: "▶️" };
export const PLATFORM_LABEL: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" };

// Defensa en profundidad para cualquier <a href={...}> con una URL guardada
// en BD (account.url, video_url…): React no sanea href como sí hace con
// dangerouslySetInnerHTML, así que un valor "javascript:..." se ejecutaría al
// clicar. Esto ya se bloquea al CREAR la cuenta (isValidAccountUrl en
// competitor.ts), pero esta comprobación en el render es la última barrera
// por si algún dato llega de otro sitio (import, migración, dato antiguo).
export function safeHref(url: string | null | undefined): string {
  if (!url) return "#";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : "#";
  } catch {
    return "#";
  }
}

export function fmt(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}
