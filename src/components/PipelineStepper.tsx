"use client";
import { STATUS_LABEL, type ScriptStatus } from "@/lib/status";

// Las 6 etapas "hacia adelante" del pipeline de un guion. "descartado" es una
// salida lateral, no un paso más allá de "Subido" — se maneja aparte.
const FORWARD_STEPS: ScriptStatus[] = [
  "borrador",
  "aprobado",
  "pend_grabar",
  "audio_grabado",
  "pend_edicion",
  "pend_subida",
  "subido",
];
const STEP_ICON: Record<string, string> = {
  borrador: "📝",
  aprobado: "✅",
  pend_grabar: "🎙️",
  audio_grabado: "🎧",
  pend_edicion: "✂️",
  pend_subida: "⬆️",
  subido: "🚀",
};

// Stepper horizontal con círculos conectados en vez de un <select> con texto
// plano: se ve de un vistazo dónde está el guion en el pipeline, y se puede
// avanzar/retroceder pulsando directamente sobre cualquier etapa.
export function PipelineStepper({ status, onChange }: { status: string; onChange: (s: string) => void }) {
  const discarded = status === "descartado";
  const currentIndex = FORWARD_STEPS.indexOf(status as ScriptStatus);

  return (
    <div>
      <div className="flex items-center">
        {FORWARD_STEPS.map((step, i) => {
          const done = !discarded && i < currentIndex;
          const active = !discarded && i === currentIndex;
          return (
            <div key={step} className="flex flex-1 items-center last:flex-none">
              <button
                type="button"
                onClick={() => onChange(step)}
                title={STATUS_LABEL[step]}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm transition ${
                  active
                    ? "bg-brand text-white shadow-[0_0_16px_-2px_rgba(59,130,246,0.75)]"
                    : done
                    ? "bg-emerald-600/80 text-white"
                    : "bg-panel2 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {STEP_ICON[step]}
              </button>
              {i < FORWARD_STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 transition ${done ? "bg-emerald-600/60" : "bg-edge"}`} />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className={`text-xs font-semibold ${discarded ? "text-red-400" : "text-zinc-200"}`}>
          {discarded ? "🗑 Descartado" : `${STEP_ICON[status] ?? ""} ${STATUS_LABEL[status as ScriptStatus] ?? status}`}
        </span>
        <button
          type="button"
          onClick={() => onChange(discarded ? "borrador" : "descartado")}
          className="shrink-0 text-[11px] text-zinc-600 hover:text-red-400"
        >
          {discarded ? "restaurar" : "descartar"}
        </button>
      </div>
    </div>
  );
}
