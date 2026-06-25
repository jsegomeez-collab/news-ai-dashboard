"use client";
import { useState } from "react";
import { usePoll, timeAgo } from "@/components/usePoll";
import type { NewsItem } from "@/lib/queries";

function relColor(r: number | null): string {
  if (r === null) return "bg-zinc-700 text-zinc-300";
  if (r >= 80) return "bg-emerald-600 text-white";
  if (r >= 60) return "bg-brand text-white";
  if (r >= 40) return "bg-amber-600 text-white";
  return "bg-zinc-700 text-zinc-300";
}

function GuionizarBtn({ articleId }: { articleId: number }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function go() {
    setState("loading");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId }),
      });
      const json = (await res.json()) as { ok: boolean; generated: number; error?: string };
      if (json.ok) {
        setState("done");
        setMsg(`✓ ${json.generated} guion(es) — míralos en Guiones`);
      } else {
        setState("error");
        setMsg(json.error ?? "Error");
      }
    } catch (e) {
      setState("error");
      setMsg((e as Error).message);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={go}
        disabled={state === "loading"}
        className="rounded bg-brand2 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
      >
        {state === "loading" ? "Guionizando…" : "✍️ Guionizar ahora"}
      </button>
      {msg && (
        <span className={`text-xs ${state === "error" ? "text-red-400" : "text-emerald-400"}`}>{msg}</span>
      )}
    </div>
  );
}

export default function NoticiasPage() {
  const [min, setMin] = useState(55);
  const [running, setRunning] = useState(false);
  const { data, loading, error, refresh } = usePoll<{ items: NewsItem[] }>(
    `/api/news?min=${min}&limit=120`,
    30000
  );

  async function runNow() {
    setRunning(true);
    try {
      await fetch("/api/run", { method: "POST" });
      await refresh();
    } finally {
      setRunning(false);
    }
  }

  const items = data?.items ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={runNow}
          disabled={running}
          className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {running ? "Actualizando…" : "↻ Actualizar ahora"}
        </button>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          Filtro:
          <select
            value={min}
            onChange={(e) => setMin(Number(e.target.value))}
            className="rounded border border-edge bg-panel px-2 py-1 text-zinc-200"
          >
            <option value={55}>Relevantes (≥55)</option>
            <option value={70}>Muy relevantes (≥70)</option>
            <option value={85}>Top (≥85)</option>
            <option value={0}>Todas (incl. fuera de tema)</option>
          </select>
        </label>
        <span className="text-xs text-zinc-500">
          {loading ? "cargando…" : `${items.length} noticias`} · autorefresco 30s
        </span>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          Error: {error}
        </div>
      )}

      <div className="grid gap-3">
        {items.map((n) => (
          <article key={n.id} className="rounded-lg border border-edge bg-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <a
                href={n.url}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-white hover:text-brand"
              >
                {n.title}
              </a>
              <span
                className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold ${relColor(n.relevance)}`}
                title="Relevancia para IA+negocio"
              >
                {n.relevance ?? "…"}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-500">
              <span>{n.source}</span>
              {n.category && <span className="text-brand2">#{n.category}</span>}
              <span>{timeAgo(n.fetched_at)}</span>
            </div>
            {n.business_angle && (
              <p className="mt-2 text-sm text-zinc-300">
                <span className="text-zinc-500">💼 Ángulo:</span> {n.business_angle}
              </p>
            )}
            {n.actuality_link && (
              <p className="mt-1 text-sm text-zinc-400">
                <span className="text-zinc-500">🔗 Actualidad:</span> {n.actuality_link}
              </p>
            )}
            <div className="mt-3 border-t border-edge/60 pt-3">
              <GuionizarBtn articleId={n.id} />
            </div>
          </article>
        ))}
        {!loading && items.length === 0 && (
          <p className="text-sm text-zinc-500">
            No hay noticias todavía. Pulsa “Actualizar ahora” o espera al worker.
          </p>
        )}
      </div>
    </div>
  );
}
