"use client";
import { useEffect, useState } from "react";
import { usePoll } from "@/components/usePoll";

type Status = {
  apiKey: boolean;
  budget: {
    scriptsToday: number;
    costToday: number;
    maxScripts: number;
    maxUsd: number;
    canGenerate: boolean;
    reason: string | null;
  };
  stats: { articles: number; classified: number; scripts: number; queuePending: number };
  knowledge: { fileCount: number; hasBases: boolean; hasTono: boolean };
};

type Settings = {
  genModel: string;
  autoGenerate: boolean;
  relevanceThreshold: number;
  formats: ("reel" | "youtube")[];
};
type ModelOption = { id: string; label: string };

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-edge bg-panel p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase text-zinc-400">{title}</h3>
      {children}
    </div>
  );
}
function Row({ k, v, ok }: { k: string; v: React.ReactNode; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-edge/50 py-1.5 text-sm last:border-0">
      <span className="text-zinc-400">{k}</span>
      <span className={ok === undefined ? "text-zinc-200" : ok ? "text-emerald-400" : "text-amber-400"}>
        {v}
      </span>
    </div>
  );
}

function GenerationConfig() {
  const [s, setS] = useState<Settings | null>(null);
  const [opts, setOpts] = useState<ModelOption[]>([]);
  const [saved, setSaved] = useState(false);

  async function load() {
    const res = await fetch("/api/settings", { cache: "no-store" });
    const json = (await res.json()) as { settings: Settings; modelOptions: ModelOption[] };
    setS(json.settings);
    setOpts(json.modelOptions);
  }
  useEffect(() => {
    load();
  }, []);

  async function patch(p: Partial<Settings>) {
    if (!s) return;
    const next = { ...s, ...p };
    setS(next);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  if (!s) return <Card title="Configuración de generación">Cargando…</Card>;

  const toggleFormat = (f: "reel" | "youtube") => {
    const has = s.formats.includes(f);
    const formats = has ? s.formats.filter((x) => x !== f) : [...s.formats, f];
    patch({ formats });
  };

  return (
    <Card title={`Configuración de generación ${saved ? "· guardado ✓" : ""}`}>
      <div className="space-y-4">
        <div>
          <div className="mb-1 text-sm text-zinc-300">Modelo que escribe los guiones</div>
          <select
            value={s.genModel}
            onChange={(e) => patch({ genModel: e.target.value })}
            className="w-full rounded border border-edge bg-ink p-2 text-sm text-zinc-200"
          >
            {opts.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="mb-1 text-sm text-zinc-300">¿Qué formatos generar?</div>
          <div className="flex gap-2">
            {([
              ["reel", "📱 Instagram / Reels"],
              ["youtube", "▶️ YouTube"],
            ] as const).map(([f, label]) => (
              <button
                key={f}
                onClick={() => toggleFormat(f)}
                className={`flex-1 rounded border px-3 py-2 text-sm font-medium ${
                  s.formats.includes(f)
                    ? "border-brand bg-brand/20 text-white"
                    : "border-edge bg-ink text-zinc-400"
                }`}
              >
                {s.formats.includes(f) ? "✓ " : ""}
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-zinc-300">Generación automática</div>
            <div className="text-xs text-zinc-500">Crea guiones solo al llegar noticias relevantes</div>
          </div>
          <button
            onClick={() => patch({ autoGenerate: !s.autoGenerate })}
            className={`relative h-6 w-11 rounded-full transition ${
              s.autoGenerate ? "bg-emerald-600" : "bg-edge"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
                s.autoGenerate ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>

        <div>
          <div className="mb-1 flex justify-between text-sm text-zinc-300">
            <span>Umbral de relevancia para guionizar</span>
            <span className="font-semibold text-brand">{s.relevanceThreshold}</span>
          </div>
          <input
            type="range"
            min={40}
            max={95}
            step={5}
            value={s.relevanceThreshold}
            onChange={(e) => patch({ relevanceThreshold: Number(e.target.value) })}
            className="w-full accent-brand"
          />
          <div className="text-xs text-zinc-500">
            Solo se generan guiones de noticias con relevancia ≥ {s.relevanceThreshold}.
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function AjustesPage() {
  const { data } = usePoll<Status>("/api/status", 15000);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <GenerationConfig />

      {data && (
        <Card title="Gasto de hoy (estimado)">
          {(() => {
            const b = data.budget;
            const pctUsd = Math.min(100, (b.costToday / Math.max(b.maxUsd, 0.0001)) * 100);
            const pctScripts = Math.min(100, (b.scriptsToday / Math.max(b.maxScripts, 1)) * 100);
            return (
              <>
                <div className="mb-3">
                  <div className="mb-1 flex justify-between text-xs text-zinc-400">
                    <span>Coste</span>
                    <span>
                      ${b.costToday.toFixed(3)} / ${b.maxUsd.toFixed(2)}
                    </span>
                  </div>
                  <div className="h-2 rounded bg-edge">
                    <div className="h-2 rounded bg-brand" style={{ width: `${pctUsd}%` }} />
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs text-zinc-400">
                    <span>Guiones</span>
                    <span>
                      {b.scriptsToday} / {b.maxScripts}
                    </span>
                  </div>
                  <div className="h-2 rounded bg-edge">
                    <div className="h-2 rounded bg-brand2" style={{ width: `${pctScripts}%` }} />
                  </div>
                </div>
                <p className="mt-3 text-xs text-zinc-500">
                  Topes en <code>.env</code>: MAX_DAILY_USD, MAX_SCRIPTS_PER_DAY.
                </p>
              </>
            );
          })()}
        </Card>
      )}

      {data && (
        <Card title="Estado del sistema">
          <Row k="API de Anthropic" v={data.apiKey ? "Conectada" : "FALTA clave"} ok={data.apiKey} />
          <Row k="Bases de negocio" v={data.knowledge.hasBases ? "Configuradas" : "Vacías"} ok={data.knowledge.hasBases} />
          <Row k="Tonalidad" v={data.knowledge.hasTono ? "Sí" : "No"} ok={data.knowledge.hasTono} />
          <Row k="Archivos en /knowledge" v={data.knowledge.fileCount} />
        </Card>
      )}

      {data && (
        <Card title="Datos acumulados">
          <Row k="Artículos guardados" v={data.stats.articles} />
          <Row k="Clasificados" v={data.stats.classified} />
          <Row k="Guiones generados" v={data.stats.scripts} />
          <Row k="En cola de generación" v={data.stats.queuePending} />
        </Card>
      )}
    </div>
  );
}
