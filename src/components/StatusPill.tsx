import { DRIVE_STATUS_LABEL } from "@/lib/driveUi";
import { Mic, Scissors, Upload, CheckCircle2, Circle, type LucideIcon } from "lucide-react";

const STATUS_ICON: Record<string, LucideIcon> = {
  por_grabar: Mic,
  editando: Scissors,
  por_subir: Upload,
  subido: CheckCircle2,
};

// Cada estado tiene su propio color + un halo (glow) sutil a juego con el
// tema — "subido" brilla un poco más porque es el estado de "ya está hecho",
// el resto queda plano para no competir visualmente con él.
const STATUS_STYLE: Record<string, string> = {
  por_grabar: "bg-white/[0.05] text-zinc-300 ring-1 ring-inset ring-edge",
  editando: "bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/40",
  por_subir: "bg-brand/15 text-brand2 ring-1 ring-inset ring-brand/50 shadow-[0_0_14px_-4px_rgba(0,112,248,0.7)]",
  subido: "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/40 shadow-[0_0_16px_-4px_rgba(16,185,129,0.6)]",
};

export function StatusPill({ status, size = "md" }: { status: string; size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs";
  const Icon = STATUS_ICON[status] ?? Circle;
  const iconSize = size === "sm" ? 11 : 13;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold ${sizeClass} ${
        STATUS_STYLE[status] ?? STATUS_STYLE.por_grabar
      }`}
    >
      <Icon size={iconSize} />
      {DRIVE_STATUS_LABEL[status] ?? status}
    </span>
  );
}
