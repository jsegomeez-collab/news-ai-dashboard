"use client";
import { STATUS_LABEL, type ScriptStatus } from "@/lib/status";
import {
  FileEdit, CheckCircle2, Mic, Headphones, Scissors, Upload, Rocket, Trash2, type LucideIcon,
} from "lucide-react";

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
const STEP_ICON: Record<string, LucideIcon> = {
  borrador: FileEdit,
  aprobado: CheckCircle2,
  pend_grabar: Mic,
  audio_grabado: Headphones,
  pend_edicion: Scissors,
  pend_subida: Upload,
  subido: Rocket,
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
          const StepIcon = STEP_ICON[step];
          return (
            <div key={step} className="flex flex-1 items-center last:flex-none">
              <button
                type="button"
                onClick={() => onChange(step)}
                title={STATUS_LABEL[step]}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm transition ${
                  active
                    ? "bg-gradient-to-br from-brand2 to-brand text-white shadow-[0_0_18px_-2px_rgba(0,112,248,0.85)] ring-1 ring-glow/60"
                    : done
                    ? "bg-emerald-600/70 text-white"
                    : "bg-white/[0.05] text-zinc-500 ring-1 ring-inset ring-edge hover:text-zinc-200"
                }`}
              >
                <StepIcon size={15} />
              </button>
              {i < FORWARD_STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 transition ${done ? "bg-emerald-500/60" : "bg-edge"}`} />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className={`flex items-center gap-1.5 text-xs font-semibold ${discarded ? "text-live" : "text-zinc-200"}`}>
          {discarded ? (
            <><Trash2 size={13} /> Descartado</>
          ) : (
            (() => { const StatusIcon = STEP_ICON[status]; return <>{StatusIcon && <StatusIcon size={13} />} {STATUS_LABEL[status as ScriptStatus] ?? status}</>; })()
          )}
        </span>
        <button
          type="button"
          onClick={() => onChange(discarded ? "borrador" : "descartado")}
          className="shrink-0 text-[11px] text-zinc-600 hover:text-live"
        >
          {discarded ? "restaurar" : "descartar"}
        </button>
      </div>
    </div>
  );
}
