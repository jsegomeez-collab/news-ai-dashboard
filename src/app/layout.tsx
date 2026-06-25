import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { StatusBar } from "@/components/StatusBar";

export const metadata: Metadata = {
  title: "AI Actualidad — Dashboard",
  description: "Noticias de IA para negocios + motor de guiones",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white">
                AI <span className="text-brand">Actualidad</span>
              </h1>
              <p className="text-sm text-zinc-400">
                IA para negocios digitales · noticias en vivo + guiones automáticos
              </p>
            </div>
          </header>
          <div className="mb-4">
            <StatusBar />
          </div>
          <Nav />
          <main className="mt-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
