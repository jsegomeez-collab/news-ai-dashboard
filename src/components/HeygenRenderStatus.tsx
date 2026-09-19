"use client";
import { useState } from "react";
import { usePoll } from "./usePoll";

type Render = {
  status: "processing" | "captioning" | "completed" | "error";
  error_msg: string | null;
  duration_sec: number | null;
  cost_usd: number | null;
} | null;

const STATUS_TEXT: Record<string, string> = {
  processing: "🎬 Generando el avatar con HeyGen…",
  // Ya no se edita solo por tener esta pantalla abierta — falta el "Proceso
  // 2" (botón "▶ Continuar proceso de vídeos" en la parte de arriba de la
  // página) para que se le añadan subtítulos y se publique.
  captioning: "✅ HeyGen ya lo generó — pulsa \"Continuar proceso de vídeos\" arriba para editarlo y publicarlo.",
};

// Estado del vídeo con avatar de un guion (script o adaptado de competencia),
// con botón para arrancarlo a mano (sin esperar a que el guion esté
// 'aprobado' ni al ciclo automático del worker) y para reintentar si falló.
export function HeygenRenderStatus({ type, id }: { type: "script" | "competitor_script"; id: number }) {
  const { data, refresh } = usePoll<{ render: Render }>(`/api/heygen/renders?type=${type}&id=${id}`, 8000);
  const render = data?.render;
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  async function start() {
    setStarting(true);
    setStartError(null);
    try {
      const res = await fetch("/api/heygen/renders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json.ok) setStartError(json.error ?? "No se pudo lanzar el vídeo");
      else refresh();
    } finally {
      setStarting(false);
    }
  }

  if (!render) {
    return (
      <div className="rounded bg-ink/60 p-3">
        <button
          onClick={start}
          disabled={starting}
          className="rounded border border-edge px-2.5 py-1 text-xs text-zinc-300 hover:border-brand hover:text-brand disabled:opacity-50"
        >
          {starting ? "Lanzando…" : "🎬 Generar vídeo con avatar"}
        </button>
        {startError && <p className="mt-2 text-xs text-red-400">{startError}</p>}
      </div>
    );
  }

  if (render.status === "error") {
    return (
      <div className="rounded bg-red-950/40 p-3 text-sm text-red-300">
        <p>⚠️ Vídeo con avatar: {render.error_msg || "error desconocido"}</p>
        <p className="mt-1 text-xs text-red-300/70">
          Si HeyGen llegó a generar el vídeo, se guardó igual en tu Drive (carpeta &quot;🤖 Vídeos generados&quot;), sin subtítulos.
        </p>
        <button
          onClick={start}
          disabled={starting}
          className="mt-2 rounded border border-red-800 px-2.5 py-1 text-xs text-red-300 hover:border-red-500 disabled:opacity-50"
        >
          {starting ? "Lanzando…" : "🔁 Reintentar"}
        </button>
        {startError && <p className="mt-2 text-xs text-red-400">{startError}</p>}
      </div>
    );
  }

  if (render.status === "processing" || render.status === "captioning") {
    return <div className="rounded bg-ink/60 p-3 text-sm text-zinc-400">{STATUS_TEXT[render.status]}</div>;
  }

  return (
    <div className="rounded bg-ink/60 p-3">
      <div className="mb-2 text-xs uppercase text-zinc-500">🧑‍💻 Vídeo con avatar (HeyGen + subtítulos)</div>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video controls preload="metadata" className="w-full max-w-xs rounded" src={`/api/heygen/renders/media?type=${type}&id=${id}`} />
      {render.duration_sec !== null && (
        <p className="mt-1 text-xs text-zinc-600">
          {Math.round(render.duration_sec)}s{render.cost_usd ? ` · ~$${render.cost_usd.toFixed(2)}` : ""}
        </p>
      )}
      <p className="mt-1 text-xs text-zinc-600">También guardado en tu Drive, carpeta &quot;🤖 Vídeos generados&quot;.</p>
    </div>
  );
}
