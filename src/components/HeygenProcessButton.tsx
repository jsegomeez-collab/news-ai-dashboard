"use client";
import { useState } from "react";
import { Clapperboard, Play } from "lucide-react";

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
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-edge bg-panel px-3 py-2 text-xs">
      <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wide text-zinc-500"><Clapperboard size={13} /> Vídeo con avatar</span>
      <button
        onClick={run}
        disabled={running}
        className="flex items-center gap-1.5 rounded bg-brand px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
        title="Comprueba HeyGen, añade subtítulos (un vídeo por pulsación) y publica en Metricool lo que ya esté listo"
      >
        {running ? "Procesando…" : <><Play size={12} /> Continuar proceso</>}
      </button>
      <span className="text-zinc-600">Marca guiones abajo para generar vídeos; este botón avanza los ya arrancados, uno por pulsación.</span>
      {result && <span className="text-zinc-300">{result}</span>}
    </div>
  );
}
