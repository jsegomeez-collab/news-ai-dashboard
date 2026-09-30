import { SiInstagram, SiTiktok, SiYoutube } from "react-icons/si";
import type { IconType } from "react-icons";

// Insignias de marca REALES en vez de emoji (📸🎵▶️): a diferencia del resto
// de la app (lucide, un solo trazo), aquí interesa más que se reconozcan al
// vuelo como "esto es Instagram/TikTok/YouTube" que encajar con el lenguaje
// de iconos propio — mismo criterio que cualquier panel de redes sociales
// (Metricool incluido). Un solo color de marca por plataforma; TikTok en
// blanco porque su negro de marca se pierde sobre el fondo marino oscuro.
const PLATFORM_META: Record<string, { Icon: IconType; color: string; label: string }> = {
  instagram: { Icon: SiInstagram, color: "#E4405F", label: "Instagram" },
  tiktok: { Icon: SiTiktok, color: "#ffffff", label: "TikTok" },
  youtube: { Icon: SiYoutube, color: "#FF0000", label: "YouTube" },
};

export function platformLabel(platform: string): string {
  return PLATFORM_META[platform]?.label ?? platform;
}

export function PlatformIcon({ platform, size = 15, className = "" }: { platform: string; size?: number; className?: string }) {
  const meta = PLATFORM_META[platform];
  if (!meta) return null;
  return <meta.Icon size={size} color={meta.color} className={`shrink-0 ${className}`} aria-label={meta.label} />;
}

// Icono + @handle, el patrón más repetido en /competencia y /adaptados.
export function PlatformHandle({ platform, handle, size = 15 }: { platform: string; handle: string; size?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <PlatformIcon platform={platform} size={size} />@{handle}
    </span>
  );
}
