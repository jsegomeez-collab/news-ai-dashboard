"use client";
import { usePoll } from "./usePoll";

type Render = {
  status: "processing" | "captioning" | "completed" | "error";
  error_msg: string | null;
  duration_sec: number | null;
  cost_usd: number | null;
} | null;

const STATUS_TEXT: Record<string, string> = {
  processing: "🎬 Generando el avatar con HeyGen…",
  captioning: "✍️ Añadiendo subtítulos y título (Whisper + Remotion)…",
};

// Estado del vídeo con avatar de un guion (script o adaptado de competencia).
// Si nunca se lanzó ninguno (sin HeyGen configurado, o el guion aún no está
// 'aprobado'), no pinta nada — no hay nada que mostrar todavía.
export function HeygenRenderStatus({ type, id }: { type: "script" | "competitor_script"; id: number }) {
  const { data } = usePoll<{ render: Render }>(`/api/heygen/renders?type=${type}&id=${id}`, 8000);
  const render = data?.render;

  if (!render) return null;

  if (render.status === "error") {
    return (
      <div className="rounded bg-red-950/40 p-3 text-sm text-red-300">
        ⚠️ Vídeo con avatar: {render.error_msg || "error desconocido"}
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
    </div>
  );
}
