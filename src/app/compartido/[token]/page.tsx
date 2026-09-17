import { notFound } from "next/navigation";
import { getSharedLinkContent } from "@/lib/sharedLinks";

// Página pública (sin login): AppShell y el middleware dejan pasar /compartido/*
// sin comprobar sesión, porque quien la abre es el influencer/editor externo,
// no un usuario de la app.
export default async function SharedScriptsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = getSharedLinkContent(token);
  if (!data || data.scripts.length === 0) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand">AI Actualidad</p>
      <h1 className="mb-1 text-xl font-bold text-white">{data.title || "Guiones para grabar"}</h1>
      <p className="mb-8 text-sm text-zinc-500">
        {data.scripts.length} guion{data.scripts.length === 1 ? "" : "es"}
      </p>

      <div className="space-y-6">
        {data.scripts.map((s, i) => (
          <article key={i} className="rounded-xl border border-edge bg-panel p-6">
            <h2 className="mb-3 text-base font-semibold text-white">
              GUION {i + 1}: <span className="font-normal text-zinc-300">{s.title}</span>
            </h2>
            <p className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-200">{s.text}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
