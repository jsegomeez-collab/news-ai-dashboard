"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Newspaper, Radar, PenLine, FolderOpen, HardDrive, CalendarDays, Brain, Settings, ShieldCheck, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; icon: LucideIcon; label: string; adminOnly?: boolean };
export type NavGroup = { title: string; items: NavItem[] };

// Agrupado en el ORDEN DEL FLUJO de trabajo (de dónde entra el contenido →
// qué guiones salen → dónde se producen y publican → cómo se configura), en
// vez de una fila plana de 9 pestañas sin criterio: así la navegación cuenta
// sola qué va antes de qué. Iconos de lucide-react (mismo grosor de trazo en
// todos lados) en vez de emoji — antes cada sistema operativo los dibujaba
// distinto y rompían la sensación de marca unificada.
export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Entrada",
    items: [
      { href: "/", icon: Newspaper, label: "Noticias" },
      { href: "/competencia", icon: Radar, label: "Competencia" },
    ],
  },
  {
    title: "Guiones",
    items: [
      { href: "/guiones", icon: PenLine, label: "De noticias" },
      { href: "/adaptados", icon: FolderOpen, label: "Adaptados" },
    ],
  },
  {
    title: "Producción",
    items: [
      { href: "/drive", icon: HardDrive, label: "Drive" },
      { href: "/calendario", icon: CalendarDays, label: "Calendario" },
    ],
  },
  {
    title: "Configuración",
    items: [
      { href: "/marca", icon: Brain, label: "Marca" },
      { href: "/ajustes", icon: Settings, label: "Ajustes" },
      { href: "/admin", icon: ShieldCheck, label: "Admin", adminOnly: true },
    ],
  },
];

export function visibleGroups(isAdmin: boolean): NavGroup[] {
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.adminOnly || isAdmin) }));
}

export function groupForPath(path: string): NavGroup | undefined {
  return NAV_GROUPS.find((g) => g.items.some((i) => i.href === path));
}

// Para que PageHeader use SIEMPRE el mismo icono que la barra lateral, sin
// que cada página tenga que repetirlo (antes cada page.tsx volvía a escribir
// el emoji a mano — una segunda fuente de verdad que podía desincronizarse).
export function currentNavItem(path: string): NavItem | undefined {
  return NAV_GROUPS.flatMap((g) => g.items).find((i) => i.href === path);
}

// Barra lateral (escritorio): grupos con "eyebrow" en mono y enlaces con
// icono; el activo lleva fondo azul y borde luminoso.
export function Sidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const path = usePathname();
  return (
    <nav className="space-y-6">
      {visibleGroups(isAdmin).map((g) => (
        <div key={g.title}>
          <div className="eyebrow mb-2 px-2">{g.title}</div>
          <div className="space-y-1">
            {g.items.map((it) => {
              const active = path === it.href;
              const Icon = it.icon;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`group flex items-center gap-3 rounded-xl px-2.5 py-2 text-[0.92rem] transition ${
                    active
                      ? "bg-brand/15 font-semibold text-white ring-1 ring-inset ring-brand/50 shadow-[0_0_18px_rgba(0,112,248,0.25)]"
                      : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
                  }`}
                >
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition ${
                      active
                        ? "bg-gradient-to-br from-brand/60 to-panel2 text-white shadow-[0_0_14px_rgba(0,112,248,0.5)]"
                        : "bg-white/[0.04] text-zinc-400 group-hover:bg-white/[0.07] group-hover:text-zinc-200"
                    }`}
                  >
                    <Icon size={17} strokeWidth={2.1} />
                  </span>
                  <span>{it.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

// Versión móvil: una sola tira horizontal con scroll, separador entre grupos.
export function MobileNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const path = usePathname();
  const groups = visibleGroups(isAdmin);
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1">
      {groups.map((g, gi) => (
        <div key={g.title} className="flex shrink-0 items-center gap-1">
          {gi > 0 && <span className="mx-1.5 h-5 w-px bg-edge" />}
          {g.items.map((it) => {
            const active = path === it.href;
            const Icon = it.icon;
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition ${
                  active
                    ? "border-brand/60 bg-brand/15 font-semibold text-white shadow-[0_0_14px_rgba(0,112,248,0.35)]"
                    : "border-transparent text-zinc-400 hover:text-zinc-100"
                }`}
              >
                <Icon size={15} strokeWidth={2.1} />
                {it.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
