"use client";
import { useState } from "react";
import { Clapperboard } from "lucide-react";

// Barra de acción para el arranque MANUAL en bloque del pipeline de avatar
// (HeyGen -> Whisper/Remotion -> Drive/Calendario/Metricool) sobre varios
// guiones a la vez. El disparo automático por-aprobación se quitó a
// propósito (gastaba HeyGen sin control, vació la cuenta de golpe) — esta
// barra es la única vía para lanzar más de uno de golpe, y solo se dispara
// cuando el usuario pulsa el botón, nunca solo.
// Secuencial (no Promise.all): cada llamada a /api/heygen/renders vuelve a
// comprobar el tope de gasto diario con el gasto YA comprometido por las
// anteriores de este mismo lote (ver pendingHeygenCost en heygenUsage.ts) —
// en paralelo, todas verían el mismo gasto "todavía no contado" y se
// colarían por encima del tope igual que pasaba antes.
export function HeygenBulkBar({
  sourceType,
  selectedIds,
  onClear,
  onDone,
}: {
  sourceType: "script" | "competitor_script";
  selectedIds: number[];
  onClear: () => void;
  onDone: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  if (selectedIds.length === 0) return null;

  async function start() {
    setRunning(true);
    setResult(null);
    let ok = 0;
    let capped = 0;
    let failed = 0;
    for (const id of selectedIds) {
      try {
        const res = await fetch("/api/heygen/renders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: sourceType, id }),
        });
        const json = (await res.json()) as { ok?: boolean; capped?: boolean };
        if (json.ok) ok++;
        else if (json.capped) capped++;
        else failed++;
      } catch {
        failed++;
      }
    }
    setRunning(false);
    const parts = [`${ok} lanzados`];
    if (capped > 0) parts.push(`${capped} frenados por el tope de gasto`);
    if (failed > 0) parts.push(`${failed} con error`);
    setResult(parts.join(" · "));
    onDone();
    onClear();
  }

  return (
    <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-brand bg-panel p-3 shadow-lg">
      <span className="text-sm text-zinc-200">{selectedIds.length} seleccionado(s)</span>
      <button
        onClick={start}
        disabled={running}
        className="flex items-center gap-1.5 rounded bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {running ? "Lanzando…" : <><Clapperboard size={14} /> Generar vídeo con avatar</>}
      </button>
      <button onClick={onClear} disabled={running} className="text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-50">
        cancelar selección
      </button>
      {result && <span className="text-xs text-zinc-400">{result}</span>}
    </div>
  );
}
