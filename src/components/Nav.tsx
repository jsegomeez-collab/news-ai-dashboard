"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const baseTabs = [
  { href: "/", label: "📰 Noticias en vivo" },
  { href: "/guiones", label: "🎬 Guiones" },
  { href: "/competencia", label: "🕵️ Competencia" },
  { href: "/adaptados", label: "🗂️ Adaptados" },
  { href: "/drive", label: "🗄️ Drive" },
  { href: "/calendario", label: "📅 Calendario" },
  { href: "/marca", label: "🧠 Marca" },
  { href: "/ajustes", label: "⚙️ Ajustes" },
];

export function Nav({ isAdmin = false }: { isAdmin?: boolean }) {
  const path = usePathname();
  const tabs = isAdmin ? [...baseTabs, { href: "/admin", label: "🛡️ Admin" }] : baseTabs;
  return (
    // overflow-x-auto en vez de dejar que las etiquetas más largas ("Noticias
    // en vivo") envuelvan en móvil — eso rompía la altura de la fila entera.
    <nav className="flex gap-2 overflow-x-auto border-b border-edge">
      {tabs.map((t) => {
        const active = path === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition ${
              active ? "border-brand text-white" : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
