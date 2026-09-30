"use client";
import { usePathname } from "next/navigation";
import { groupForPath, currentNavItem } from "@/components/Nav";
import type { LucideIcon } from "lucide-react";

// Cabecera uniforme para todas las páginas, con el lenguaje de la landing:
// "eyebrow" en mono con la fase del flujo (Entrada / Guiones / Producción /
// Configuración), loseta con el MISMO icono que la barra lateral (se deriva
// solo de la ruta actual — ya no hace falta que cada página repita el suyo
// a mano, así nunca se desincroniza), título Inter 900 compacto con halo,
// una línea que dice para qué sirve la sección y hueco para acciones.
export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
  icon,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  eyebrow?: string;
  /** Solo para páginas sin entrada en la navegación (p.ej. no hace falta hoy) — normalmente se deriva sola. */
  icon?: LucideIcon;
}) {
  const path = usePathname();
  const group = eyebrow ?? groupForPath(path)?.title;
  const Icon = icon ?? currentNavItem(path)?.icon;

  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-start gap-4">
        {Icon && (
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-edge2/60 bg-gradient-to-br from-brand/40 to-deep text-brand2 shadow-[0_0_18px_rgba(0,112,248,0.4),inset_0_0_12px_rgba(0,112,248,0.3)] [filter:drop-shadow(0_0_10px_rgba(77,163,255,0.45))]">
            <Icon size={22} strokeWidth={2} />
          </span>
        )}
        <div>
          {group && <div className="eyebrow mb-1.5">{group}</div>}
          <h2 className="title-glow text-2xl font-black tracking-[-0.03em] text-white md:text-[1.9rem] md:leading-none">{title}</h2>
          {subtitle && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
