"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Nav } from "@/components/Nav";
import { StatusBar } from "@/components/StatusBar";

type User = { id: number; email: string; name: string | null; isAdmin?: boolean };

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const authPage = pathname === "/login" || pathname === "/register";
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d: { user: User | null }) => setUser(d.user))
      .catch(() => setUser(null));
  }, [pathname]);

  useEffect(() => {
    if (user === undefined) return;
    if (!user && !authPage) router.replace("/login");
    if (user && authPage) router.replace("/");
  }, [user, authPage, router]);

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

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">
            AI <span className="text-brand">Actualidad</span>
          </h1>
          <p className="text-sm text-zinc-400">IA para negocios digitales · noticias + guiones</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {user.isAdmin && (
            <span className="rounded bg-brand/20 px-2 py-0.5 text-xs font-semibold text-brand">ADMIN</span>
          )}
          <span className="text-zinc-400">{user.name || user.email}</span>
          <button onClick={logout} className="rounded border border-edge px-3 py-1 text-zinc-300 hover:bg-panel">
            Salir
          </button>
        </div>
      </header>
      <div className="mb-4">
        <StatusBar />
      </div>
      <Nav isAdmin={user.isAdmin} />
      <main className="mt-6">{children}</main>
    </div>
  );
}
