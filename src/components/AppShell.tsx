"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar, MobileNav } from "@/components/Nav";
import { StatusBar } from "@/components/StatusBar";

type User = { id: number; email: string; name: string | null; isAdmin?: boolean };

// Marca: loseta blanca con "AG" (como el logo sobre blanco de la landing) +
// nombre en Inter 900 con "PRO" en azul claro.
export function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[13px] font-black tracking-tight text-ink shadow-[0_0_18px_rgba(0,112,248,0.6)]">
        AG
      </span>
      <div className="leading-none">
        <div className="text-[1.05rem] font-black tracking-[-0.03em] text-white">
          AutoGuiones <span className="text-brand2">PRO</span>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const authPage = pathname === "/login" || pathname === "/register";
  // Página pública para compartir guiones con un influencer/editor sin cuenta:
  // ni consulta sesión ni redirige a /login, y no lleva cabecera/nav de la app.
  const isShared = pathname.startsWith("/compartido/");
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    if (isShared) return;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d: { user: User | null }) => setUser(d.user))
      .catch(() => setUser(null));
  }, [pathname, isShared]);

  useEffect(() => {
    if (isShared) return;
    if (user === undefined) return;
    if (!user && !authPage) router.replace("/login");
    if (user && authPage) router.replace("/");
  }, [user, authPage, isShared, router]);

  if (isShared) return <>{children}</>;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.replace("/login");
  }

  // Páginas de login/registro: sin cabecera, centradas.
  if (authPage) {
    return <div className="flex min-h-screen items-center justify-center px-4">{children}</div>;
  }

  if (user === undefined) {
    return <div className="p-10 text-center text-sm text-zinc-500">Cargando…</div>;
  }
  if (!user) return null; // redirigiendo a /login

  const userBox = (
    <div className="flex items-center gap-2 text-sm">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand2 to-brand text-xs font-black text-white shadow-[0_0_14px_rgba(0,112,248,0.5)]">
        {(user.name || user.email).slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[0.85rem] font-semibold text-zinc-100" title={user.email}>
          {user.name || user.email}
        </div>
        {user.isAdmin && <div className="eyebrow eyebrow--plain text-[0.55rem]">admin</div>}
      </div>
      <button
        onClick={logout}
        className="rounded-full border border-edge px-2.5 py-1 text-[11px] font-semibold text-zinc-300 hover:border-edge2 hover:text-white"
      >
        Salir
      </button>
    </div>
  );

  return (
    <div className="mx-auto flex max-w-[1400px] gap-6 px-4 py-4 md:px-6 md:py-6">
      {/* Barra lateral (escritorio): navegación agrupada por fase del flujo, en una tarjeta de cristal. */}
      <aside className="hidden w-60 shrink-0 md:block">
        <div className="sticky top-6 flex max-h-[calc(100vh-3rem)] flex-col rounded-card-lg border border-edge bg-panel p-4 shadow-neon">
          <div className="mb-6 px-1">
            <Brand />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <Sidebar isAdmin={user.isAdmin} />
          </div>
          <div className="mt-5 border-t border-edge/70 pt-4">{userBox}</div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Cabecera móvil: marca + usuario, y debajo la tira de navegación. */}
        <div className="mb-4 md:hidden">
          <div className="mb-3 flex items-center justify-between gap-3">
            <Brand />
            {userBox}
          </div>
          <MobileNav isAdmin={user.isAdmin} />
        </div>

        <div className="mb-5">
          <StatusBar />
        </div>
        <main className="rise">{children}</main>
      </div>
    </div>
  );
}
