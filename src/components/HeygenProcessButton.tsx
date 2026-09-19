"use client";
import { useState } from "react";

// "Proceso 2", separado a propósito del ciclo automático de noticias/guiones
// (que solo hace eso: noticias -> guiones) y de "Actualizar ahora": aquí se
// arranca, cuando el usuario lo decide, todo lo que viene DESPUÉS de generar
// un vídeo con avatar — comprobar si HeyGen ya terminó, editarlo (Whisper +
// Remotion, la parte que satura la CPU de la instancia) y publicarlo en
// Metricool. Nunca se dispara solo; siempre por este botón.
export function HeygenProcessButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/heygen/process", { method: "POST" });
      const json = (await res.json()) as {
        ok?: boolean;
        completed?: number;
        errors?: number;
        published?: number;
        error?: string;
      };
      if (!json.ok) {
        setResult(json.error ?? "Error al continuar el proceso");
      } else {
        const parts = [`${json.completed ?? 0} editado(s)`];
        if ((json.published ?? 0) > 0) parts.push(`${json.published} programado(s) en Metricool`);
        if ((json.errors ?? 0) > 0) parts.push(`${json.errors} con error`);
        setResult(parts.join(" · "));
      }
    } catch {
      setResult("Error de red al continuar el proceso");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-edge bg-panel px-4 py-2.5">
      <button
        onClick={run}
        disabled={running}
        className="rounded bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {running ? "Procesando…" : "▶ Continuar proceso de vídeos"}
      </button>
      <span className="text-xs text-zinc-500">
        Comprueba HeyGen, edita con subtítulos y publica en Metricool los vídeos ya arrancados.
      </span>
      {result && <span className="text-xs text-zinc-400">{result}</span>}
    </div>
  );
}
