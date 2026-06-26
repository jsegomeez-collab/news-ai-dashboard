"use client";
import { useEffect, useState } from "react";
import { usePoll } from "@/components/usePoll";

type Settings = {
  anthropicKey: string;
  genModel: string;
  autoGenerate: boolean;
  genRelevanceThreshold: number;
  newsMinRelevance: number;
  maxScriptsPerDay: number;
  maxDailyUsd: number;
  formats: ("reel" | "youtube")[];
  windowMinutes: number;
  windowIntervalHours: number;
};
type ModelOption = { id: string; label: string };
type Status = {
  hasKey: boolean;
  budget: { scriptsToday: number; costToday: number; maxScripts: number; maxUsd: number };
  stats: { articles: number; classified: number; scripts: number; queuePending: number };
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-edge bg-panel p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase text-zinc-400">{title}</h3>
      {children}
    </div>
  );
}
function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`relative h-6 w-11 rounded-full transition ${on ? "bg-emerald-600" : "bg-edge"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

export default function AjustesPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [opts, setOpts] = useState<ModelOption[]>([]);
  const [keyInput, setKeyInput] = useState("");
  const [savedKey, setSavedKey] = useState(false);
  const { data: status } = usePoll<Status>("/api/status", 15000);

  async function load() {
    const res = await fetch("/api/settings", { cache: "no-store" });
    const json = (await res.json()) as { settings: Settings; modelOptions: ModelOption[] };
    setS(json.settings);
    setOpts(json.modelOptions);
    setKeyInput(json.settings.anthropicKey);
  }
  useEffect(() => {
    load();
  }, []);

  async function patch(p: Partial<Settings>) {
    if (!s) return;
    setS({ ...s, ...p });
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
  }

  async function saveKey() {
    await patch({ anthropicKey: keyInput });
    setSavedKey(true);
    setTimeout(() => setSavedKey(false), 1500);
  }

  if (!s) return <p className="text-sm text-zinc-500">Cargando…</p>;

  const toggleFormat = (f: "reel" | "youtube") => {
    const has = s.formats.includes(f);
    patch({ formats: has ? s.formats.filter((x) => x !== f) : [...s.formats, f] });
  };
  const num = (v: string) => Math.max(0, Number(v.replace(/[^\d.]/g, "")) || 0);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title={`Tu clave de Anthropic ${savedKey ? "· guardada ✓" : ""}`}>
        <p className="mb-2 text-sm text-zinc-400">
          Tu consumo se carga a TU cuenta de Anthropic. Consíguela en{" "}
          <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" className="text-brand hover:underline">
            console.anthropic.com
          </a>
          .
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="sk-ant-..."
            className="flex-1 rounded border border-edge bg-ink p-2 text-sm text-zinc-200 outline-none focus:border-brand"
          />
          <button onClick={saveKey} className="rounded bg-brand px-3 py-1.5 text-sm font-semibold text-white">
            Guardar
          </button>
        </div>
        <p className="mt-2 text-xs text-amber-400/80">
          ⚠️ La clave se guarda tal cual en el servidor. Úsala solo si confías en quien lo administra.
        </p>
      </Card>

      <Card title="Generación de guiones">
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
              {([["reel", "📱 Instagram / Reels"], ["youtube", "▶️ YouTube"]] as const).map(([f, label]) => (
                <button
                  key={f}
                  onClick={() => toggleFormat(f)}
                  className={`flex-1 rounded border px-3 py-2 text-sm font-medium ${
                    s.formats.includes(f) ? "border-brand bg-brand/20 text-white" : "border-edge bg-ink text-zinc-400"
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
              <div className="text-xs text-zinc-500">Genera solo al llegar noticias relevantes</div>
            </div>
            <Toggle on={s.autoGenerate} onClick={() => patch({ autoGenerate: !s.autoGenerate })} />
          </div>
        </div>
      </Card>

      <Card title="Ventana de actividad (control de gasto)">
        <p className="mb-3 text-xs text-zinc-500">
          Las noticias entran siempre. Esto limita CUÁNDO se generan guiones automáticos. Pon 0 para “siempre activo”.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-zinc-300">
            Genera durante (min)
            <input
              inputMode="numeric"
              value={String(s.windowMinutes)}
              onChange={(e) => patch({ windowMinutes: num(e.target.value) })}
              className="mt-1 w-full rounded border border-edge bg-ink p-2 text-sm text-zinc-200"
            />
          </label>
          <label className="text-sm text-zinc-300">
            Cada (horas)
            <input
              inputMode="numeric"
              value={String(s.windowIntervalHours)}
              onChange={(e) => patch({ windowIntervalHours: num(e.target.value) })}
              className="mt-1 w-full rounded border border-edge bg-ink p-2 text-sm text-zinc-200"
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Ej.: 15 min cada 2 horas → ráfagas cortas de generación a las 0:00, 2:00, 4:00…
        </p>
      </Card>

      <Card title="Filtros y topes">
        <div className="space-y-4">
          <div>
            <div className="mb-1 flex justify-between text-sm text-zinc-300">
              <span>Relevancia mínima para GENERAR guion</span>
              <span className="font-semibold text-brand">{s.genRelevanceThreshold}</span>
            </div>
            <input type="range" min={40} max={98} step={1} value={s.genRelevanceThreshold}
              onChange={(e) => patch({ genRelevanceThreshold: Number(e.target.value) })} className="w-full accent-brand" />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-sm text-zinc-300">
              <span>Relevancia mínima para MOSTRAR noticia</span>
              <span className="font-semibold text-brand2">{s.newsMinRelevance}</span>
            </div>
            <input type="range" min={0} max={95} step={5} value={s.newsMinRelevance}
              onChange={(e) => patch({ newsMinRelevance: Number(e.target.value) })} className="w-full accent-brand2" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-zinc-300">
              Máx. guiones/día
              <input inputMode="numeric" value={String(s.maxScriptsPerDay)}
                onChange={(e) => patch({ maxScriptsPerDay: num(e.target.value) })}
                className="mt-1 w-full rounded border border-edge bg-ink p-2 text-sm text-zinc-200" />
            </label>
            <label className="text-sm text-zinc-300">
              Máx. gasto/día (USD)
              <input inputMode="numeric" value={String(s.maxDailyUsd)}
                onChange={(e) => patch({ maxDailyUsd: num(e.target.value) })}
                className="mt-1 w-full rounded border border-edge bg-ink p-2 text-sm text-zinc-200" />
            </label>
          </div>
        </div>
      </Card>

      {status && (
        <Card title="Gasto de hoy">
          <div className="mb-3">
            <div className="mb-1 flex justify-between text-xs text-zinc-400">
              <span>Coste</span>
              <span>${status.budget.costToday.toFixed(3)} / ${status.budget.maxUsd.toFixed(2)}</span>
            </div>
            <div className="h-2 rounded bg-edge">
              <div className="h-2 rounded bg-brand" style={{ width: `${Math.min(100, (status.budget.costToday / Math.max(status.budget.maxUsd, 0.0001)) * 100)}%` }} />
            </div>
          </div>
          <div className="mb-1 flex justify-between text-xs text-zinc-400">
            <span>Guiones</span>
            <span>{status.budget.scriptsToday} / {status.budget.maxScripts}</span>
          </div>
          <div className="h-2 rounded bg-edge">
            <div className="h-2 rounded bg-brand2" style={{ width: `${Math.min(100, (status.budget.scriptsToday / Math.max(status.budget.maxScripts, 1)) * 100)}%` }} />
          </div>
        </Card>
      )}

      {status && (
        <Card title="Tus datos">
          <div className="flex justify-between border-b border-edge/50 py-1.5 text-sm"><span className="text-zinc-400">Noticias clasificadas</span><span className="text-zinc-200">{status.stats.classified}</span></div>
          <div className="flex justify-between border-b border-edge/50 py-1.5 text-sm"><span className="text-zinc-400">Guiones generados</span><span className="text-zinc-200">{status.stats.scripts}</span></div>
          <div className="flex justify-between py-1.5 text-sm"><span className="text-zinc-400">En cola de generación</span><span className="text-zinc-200">{status.stats.queuePending}</span></div>
        </Card>
      )}
    </div>
  );
}
