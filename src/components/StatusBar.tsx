"use client";
import { usePoll } from "@/components/usePoll";

type Status = {
  hasKey: boolean;
  budget: { scriptsToday: number; costToday: number; maxScripts: number; maxUsd: number; canGenerate: boolean };
  stats: { articles: number; classified: number; scripts: number; queuePending: number };
  knowledge: { hasBases: boolean };
  window: { active: boolean; intervalHours: number };
};

function Pill({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "good" | "warn" | "bad" }) {
  const colors = { default: "text-zinc-300", good: "text-emerald-400", warn: "text-amber-400", bad: "text-red-400" };
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-zinc-500">{label}</span>
      <span className={`font-semibold ${colors[tone]}`}>{value}</span>
    </div>
  );
}

export function StatusBar() {
  const { data } = usePoll<Status>("/api/status", 15000);
  if (!data || !data.budget) return null;
  const b = data.budget;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-edge bg-panel px-4 py-2 text-xs">
      <Pill label="Clave Anthropic" value={data.hasKey ? "conectada" : "falta"} tone={data.hasKey ? "good" : "bad"} />
      <Pill label="Guiones hoy" value={`${b.scriptsToday}/${b.maxScripts}`} tone={b.canGenerate ? "default" : "warn"} />
      <Pill label="Gasto hoy" value={`$${b.costToday.toFixed(2)}/$${b.maxUsd.toFixed(0)}`} tone={b.canGenerate ? "default" : "warn"} />
      <Pill label="Noticias" value={String(data.stats.articles)} />
      <Pill label="En cola" value={String(data.stats.queuePending)} tone={data.stats.queuePending > 0 ? "warn" : "default"} />
      <Pill label="Marca" value={data.knowledge.hasBases ? "lista" : "vacía"} tone={data.knowledge.hasBases ? "good" : "warn"} />
      {data.window.intervalHours > 0 && (
        <Pill label="Ventana" value={data.window.active ? "activa ahora" : "en pausa"} tone={data.window.active ? "good" : "default"} />
      )}
    </div>
  );
}
