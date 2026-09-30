"use client";
import { usePoll } from "@/components/usePoll";
import { AlertTriangle } from "lucide-react";

type Worker = {
  lastOk: boolean;
  lastError: string | null;
  ageSeconds: number;
  competitorOk: boolean;
  competitorChecked: number;
  competitorInserted: number;
  transcribedProcessed: number;
  transcribedErrors: number;
} | null;

type Status = {
  hasKey: boolean;
  db?: { persistent: boolean; path: string };
  worker?: Worker;
  budget: { scriptsToday: number; costToday: number; maxScripts: number; maxUsd: number; canGenerate: boolean };
  stats: { articles: number; classified: number; scripts: number; queuePending: number };
  knowledge: { hasBases: boolean };
  window: { active: boolean; intervalHours: number };
};

// Umbral heurístico: el cron por defecto corre cada 2h (POLL_CRON). WARN da
// margen de un ciclo largo (~1.5x) antes de avisar; BAD da margen de 3 ciclos
// completos, punto en el que "se está retrasando" ya es "está parado".
const WORKER_WARN_MIN = 3 * 60;
const WORKER_BAD_MIN = 6 * 60;

// Formatea una antigüedad en segundos (ya calculada por el servidor) sin
// volver a restar contra el reloj del navegador — inmune a que el reloj del
// visitante esté desajustado.
function ageLabel(ageSeconds: number): string {
  if (ageSeconds < 60) return "hace un momento";
  if (ageSeconds < 3600) return `hace ${Math.floor(ageSeconds / 60)} min`;
  if (ageSeconds < 86400) return `hace ${Math.floor(ageSeconds / 3600)} h`;
  return `hace ${Math.floor(ageSeconds / 86400)} d`;
}

type Tone = "default" | "good" | "warn" | "bad";

function workerPill(w: Worker): { value: string; tone: Tone; title?: string } {
  if (!w) return { value: "nunca ha corrido", tone: "bad" };
  const minutesAgo = w.ageSeconds / 60;
  const age = ageLabel(w.ageSeconds);
  if (!w.lastOk) return { value: `falló ${age}`, tone: "bad", title: w.lastError ?? undefined };
  if (minutesAgo >= WORKER_BAD_MIN) return { value: `parado, ${age}`, tone: "bad" };
  if (minutesAgo >= WORKER_WARN_MIN) return { value: age, tone: "warn" };
  return { value: age, tone: "good" };
}

// El worker puede seguir "vivo" (noticias/guiones funcionando) mientras el
// pipeline de espionaje de competencia está roto entero (Apify caído, yt-dlp
// roto...) sin que la pill "Worker" lo refleje. Esta pill separada lo cubre.
function competitorPill(w: Worker): { value: string; tone: Tone; title?: string } {
  if (!w) return { value: "—", tone: "default" };
  if (!w.competitorOk) return { value: "error", tone: "bad", title: w.lastError ?? undefined };
  if (w.transcribedErrors > 0) return { value: `${w.transcribedErrors} error(es) transcribiendo`, tone: "warn" };
  return { value: `+${w.competitorInserted} videos / ${w.transcribedProcessed} transcritos`, tone: "default" };
}

// Píldora de cristal (como .cm-pill de la landing): etiqueta en mono
// mayúscula + valor; el tono colorea solo el valor y, si es "bad", añade el
// punto rojo latiendo.
function Pill({ label, value, tone = "default", title }: { label: string; value: string; tone?: Tone; title?: string }) {
  const colors: Record<Tone, string> = {
    default: "text-zinc-200",
    good: "text-emerald-300",
    warn: "text-amber-300",
    bad: "text-live",
  };
  const ring: Record<Tone, string> = {
    default: "border-edge",
    good: "border-emerald-500/40",
    warn: "border-amber-500/40",
    bad: "border-live/50 shadow-[0_0_14px_rgba(255,71,71,0.25)]",
  };
  return (
    <div
      className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border bg-deep/60 px-3 py-1.5 backdrop-blur ${ring[tone]}`}
      title={title}
    >
      {tone === "bad" && <span className="dot-live" />}
      <span className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</span>
      <span className={`text-xs font-semibold ${colors[tone]}`}>{value}</span>
    </div>
  );
}

export function StatusBar() {
  const { data } = usePoll<Status>("/api/status", 15000);
  if (!data || !data.budget) return null;
  const b = data.budget;
  return (
    <div className="space-y-2">
      {data.db && !data.db.persistent && (
        <div className="flex items-start gap-1.5 rounded-xl border border-live/50 bg-live/10 px-4 py-2 text-xs text-red-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span><strong>La base de datos NO es persistente</strong> ({data.db.path}). En cada deploy se borrarán las
          cuentas. En Render: añade un disco montado en <code>/data</code> y la variable{" "}
          <code>DB_PATH=/data/app.db</code>.</span>
        </div>
      )}
      {/* En móvil, una tira con scroll horizontal en vez de 8 píldoras
          apiladas que empujaban el contenido media pantalla hacia abajo. */}
      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
        <Pill label="Worker" {...workerPill(data.worker ?? null)} />
        <Pill label="Espías" {...competitorPill(data.worker ?? null)} />
        <Pill label="Anthropic" value={data.hasKey ? "conectada" : "falta clave"} tone={data.hasKey ? "good" : "bad"} />
        <Pill label="Guiones hoy" value={`${b.scriptsToday}/${b.maxScripts}`} tone={b.canGenerate ? "default" : "warn"} />
        <Pill label="Gasto hoy" value={`$${b.costToday.toFixed(2)} / $${b.maxUsd.toFixed(0)}`} tone={b.canGenerate ? "default" : "warn"} />
        <Pill label="Noticias" value={String(data.stats.articles)} />
        <Pill label="En cola" value={String(data.stats.queuePending)} tone={data.stats.queuePending > 0 ? "warn" : "default"} />
        <Pill label="Marca" value={data.knowledge.hasBases ? "lista" : "vacía"} tone={data.knowledge.hasBases ? "good" : "warn"} />
        {data.window.intervalHours > 0 && (
          <Pill label="Ventana" value={data.window.active ? "activa ahora" : "en pausa"} tone={data.window.active ? "good" : "default"} />
        )}
      </div>
    </div>
  );
}
