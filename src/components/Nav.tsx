"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "📰 Noticias en vivo" },
  { href: "/guiones", label: "🎬 Guiones" },
  { href: "/marca", label: "🧠 Marca" },
  { href: "/ajustes", label: "⚙️ Ajustes" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex gap-2 border-b border-edge">
      {tabs.map((t) => {
        const active = path === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              active
                ? "border-brand text-white"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
