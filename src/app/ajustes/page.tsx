"use client";
import { useEffect, useState } from "react";
import { usePoll } from "@/components/usePoll";

type Settings = {
  hasAnthropicKey: boolean;
  hasOpenaiKey: boolean;
  hasApifyToken: boolean;
  genModel: string;
  autoGenerate: boolean;
  genRelevanceThreshold: number;
  newsMinRelevance: number;
  maxScriptsPerDay: number;
  maxDailyUsd: number;
  formats: ("reel" | "youtube")[];
  windowMinutes: number;
  windowIntervalHours: number;
  competitorAdaptLimit: number;
  hasHeygenKey: boolean;
  heygenAvatarId: string;
  heygenAvatarLabel: string;
  heygenVoiceId: string;
  heygenVoiceLabel: string;
  heygenDailyUsdCap: number;
  postingWindowStartHour: number;
  postingWindowEndHour: number;
};
type ModelOption = { id: string; label: string };
type Status = {
  hasKey: boolean;
  budget: { scriptsToday: number; costToday: number; maxScripts: number; maxUsd: number };
  heygenBudget: { videosToday: number; costToday: number; maxUsd: number };
  stats: { articles: number; classified: number; scripts: number; queuePending: number };
};
type HeygenAvatarOption = { id: string; label: string; previewUrl: string | null };
type HeygenVoiceOption = { id: string; label: string; language: string | null };

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
  const [oaiKeyInput, setOaiKeyInput] = useState("");
  const [savedOaiKey, setSavedOaiKey] = useState(false);
  const [apifyInput, setApifyInput] = useState("");
  const [savedApify, setSavedApify] = useState(false);
  const [heygenKeyInput, setHeygenKeyInput] = useState("");
  const [savedHeygenKey, setSavedHeygenKey] = useState(false);
  const [heygenAvatars, setHeygenAvatars] = useState<HeygenAvatarOption[] | null>(null);
  const [heygenVoices, setHeygenVoices] = useState<HeygenVoiceOption[] | null>(null);
  const [heygenLoadError, setHeygenLoadError] = useState<string | null>(null);
  const [loadingHeygen, setLoadingHeygen] = useState<"avatars" | "voices" | null>(null);
  const { data: status } = usePoll<Status>("/api/status", 15000);

  async function load() {
    const res = await fetch("/api/settings", { cache: "no-store" });
    const json = (await res.json()) as { settings: Settings; modelOptions: ModelOption[] };
    setS(json.settings);
    setOpts(json.modelOptions);
    // Las claves NUNCA vuelven del servidor (solo hasXKey) — los campos
    // arrancan vacíos siempre; escribir algo y guardar es la única forma de
    // cambiarlas, nunca se precargan con el valor real.
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

  // Las tres claves se guardan aparte de patch(): el body que se envía SÍ
  // lleva el valor real (anthropicKey/openaiKey/apifyToken, campos que ya no
  // existen en el tipo Settings del cliente), pero la respuesta del servidor
  // solo trae hasXKey — nunca se vuelve a meter el secreto en el estado.
  async function saveKey() {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anthropicKey: keyInput }),
    });
    const json = (await res.json()) as { settings: Settings };
    setS(json.settings);
    setKeyInput("");
    setSavedKey(true);
    setTimeout(() => setSavedKey(false), 1500);
  }
  async function saveOaiKey() {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openaiKey: oaiKeyInput }),
    });
    const json = (await res.json()) as { settings: Settings };
    setS(json.settings);
    setOaiKeyInput("");
    setSavedOaiKey(true);
    setTimeout(() => setSavedOaiKey(false), 1500);
  }
  async function saveApify() {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apifyToken: apifyInput }),
    });
    const json = (await res.json()) as { settings: Settings };
    setS(json.settings);
    setApifyInput("");
    setSavedApify(true);
    setTimeout(() => setSavedApify(false), 1500);
  }
  async function saveHeygenKey() {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ heygenKey: heygenKeyInput }),
    });
    const json = (await res.json()) as { settings: Settings };
    setS(json.settings);
    setHeygenKeyInput("");
    setSavedHeygenKey(true);
    setTimeout(() => setSavedHeygenKey(false), 1500);
  }

  async function loadHeygenAvatars() {
    setLoadingHeygen("avatars");
    setHeygenLoadError(null);
    const res = await fetch("/api/heygen/avatars", { cache: "no-store" });
    const json = (await res.json()) as { avatars?: HeygenAvatarOption[]; error?: string };
    if (json.error) setHeygenLoadError(json.error);
    else setHeygenAvatars(json.avatars ?? []);
    setLoadingHeygen(null);
  }
  async function loadHeygenVoices() {
    setLoadingHeygen("voices");
    setHeygenLoadError(null);
    const res = await fetch("/api/heygen/voices", { cache: "no-store" });
    const json = (await res.json()) as { voices?: HeygenVoiceOption[]; error?: string };
    if (json.error) setHeygenLoadError(json.error);
    else setHeygenVoices(json.voices ?? []);
    setLoadingHeygen(null);
  }
  function pickHeygenAvatar(a: HeygenAvatarOption) {
    patch({ heygenAvatarId: a.id, heygenAvatarLabel: a.label });
  }
  function pickHeygenVoice(v: HeygenVoiceOption) {
    patch({ heygenVoiceId: v.id, heygenVoiceLabel: v.label });
  }

  if (!s) return <p className="text-sm text-zinc-500">Cargando…</p>;

  const toggleFormat = (f: "reel" | "youtube") => {
    const has = s.formats.includes(f);
    patch({ formats: has ? s.formats.filter((x) => x !== f) : [...s.formats, f] });
  };
  const num = (v: string) => Math.max(0, Number(v.replace(/[^\d.]/g, "")) || 0);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title={`Tu clave de Anthropic ${savedKey ? "· guardada ✓" : s.hasAnthropicKey ? "· configurada ✓" : ""}`}>
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
            placeholder={s.hasAnthropicKey ? "•••••••••••• (escribe para cambiarla)" : "sk-ant-..."}
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

      <Card title={`OpenAI (transcripción) ${savedOaiKey ? "· guardada ✓" : s.hasOpenaiKey ? "· configurada ✓" : ""}`}>
        <p className="mb-2 text-sm text-zinc-400">
          Para transcribir reels y TikToks de la competencia via Whisper. Consíguela en{" "}
          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-brand hover:underline">
            platform.openai.com
          </a>
          . ~$0.006/min de audio (muy barato).
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={oaiKeyInput}
            onChange={(e) => setOaiKeyInput(e.target.value)}
            placeholder={s.hasOpenaiKey ? "•••••••••••• (escribe para cambiarla)" : "sk-..."}
            className="flex-1 rounded border border-edge bg-ink p-2 text-sm text-zinc-200 outline-none focus:border-brand"
          />
          <button onClick={saveOaiKey} className="rounded bg-brand px-3 py-1.5 text-sm font-semibold text-white">
            Guardar
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-600">
          Solo se usa para el módulo de Espionaje de Competencia. Tu consumo de Anthropic no varía.
        </p>
      </Card>

      <Card title={`Instagram (Apify) ${savedApify ? "· guardado ✓" : s.hasApifyToken ? "· configurado ✓" : ""}`}>
        <p className="mb-2 text-sm text-zinc-400">
          Instagram bloquea el scraping directo desde servidores. Apify lo hace de forma
          segura con proxies residenciales (no expone tu IP ni ninguna cuenta). Consigue tu token en{" "}
          <a href="https://console.apify.com/account/integrations" target="_blank" rel="noreferrer" className="text-brand hover:underline">
            console.apify.com
          </a>
          . ~$0.5–2 por 1000 reels.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={apifyInput}
            onChange={(e) => setApifyInput(e.target.value)}
            placeholder={s.hasApifyToken ? "•••••••••••• (escribe para cambiarlo)" : "apify_api_..."}
            className="flex-1 rounded border border-edge bg-ink p-2 text-sm text-zinc-200 outline-none focus:border-brand"
          />
          <button onClick={saveApify} className="rounded bg-brand px-3 py-1.5 text-sm font-semibold text-white">
            Guardar
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-600">
          Sin token, las cuentas de Instagram se omiten. YouTube y TikTok no lo necesitan.
        </p>
      </Card>

      <Card title={`🧑‍💻 HeyGen (clon con IA) ${savedHeygenKey ? "· guardada ✓" : s.hasHeygenKey ? "· configurada ✓" : ""}`}>
        <p className="mb-2 text-sm text-zinc-400">
          Cuando apruebas un guion, se genera automáticamente un vídeo con TU avatar clonado
          leyéndolo. Consigue tu clave en{" "}
          <a href="https://app.heygen.com/settings?nav=API" target="_blank" rel="noreferrer" className="text-brand hover:underline">
            app.heygen.com (Ajustes → API)
          </a>
          . ~$4/min de vídeo generado — vigila el tope de abajo.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={heygenKeyInput}
            onChange={(e) => setHeygenKeyInput(e.target.value)}
            placeholder={s.hasHeygenKey ? "•••••••••••• (escribe para cambiarla)" : "tu clave de HeyGen"}
            className="flex-1 rounded border border-edge bg-ink p-2 text-sm text-zinc-200 outline-none focus:border-brand"
          />
          <button onClick={saveHeygenKey} className="rounded bg-brand px-3 py-1.5 text-sm font-semibold text-white">
            Guardar
          </button>
        </div>

        {s.hasHeygenKey && (
          <div className="mt-4 space-y-3 border-t border-edge/50 pt-3">
            <div>
              <div className="mb-1 flex items-center justify-between text-sm text-zinc-300">
                <span>Avatar (tu clon)</span>
                <button
                  onClick={loadHeygenAvatars}
                  disabled={loadingHeygen === "avatars"}
                  className="text-xs text-brand hover:underline disabled:opacity-50"
                >
                  {loadingHeygen === "avatars" ? "Cargando…" : "Cargar mis avatares"}
                </button>
              </div>
              {s.heygenAvatarId && (
                <p className="mb-1 text-xs text-zinc-500">Elegido: {s.heygenAvatarLabel || s.heygenAvatarId}</p>
              )}
              {heygenAvatars && (
                <select
                  value={s.heygenAvatarId}
                  onChange={(e) => {
                    const a = heygenAvatars.find((x) => x.id === e.target.value);
                    if (a) pickHeygenAvatar(a);
                  }}
                  className="w-full rounded border border-edge bg-ink p-2 text-sm text-zinc-200"
                >
                  <option value="">— elige un avatar —</option>
                  {heygenAvatars.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-sm text-zinc-300">
                <span>Voz</span>
                <button
                  onClick={loadHeygenVoices}
                  disabled={loadingHeygen === "voices"}
                  className="text-xs text-brand hover:underline disabled:opacity-50"
                >
                  {loadingHeygen === "voices" ? "Cargando…" : "Cargar mis voces"}
                </button>
              </div>
              {s.heygenVoiceId && (
                <p className="mb-1 text-xs text-zinc-500">Elegida: {s.heygenVoiceLabel || s.heygenVoiceId}</p>
              )}
              {heygenVoices && (
                <select
                  value={s.heygenVoiceId}
                  onChange={(e) => {
                    const v = heygenVoices.find((x) => x.id === e.target.value);
                    if (v) pickHeygenVoice(v);
                  }}
                  className="w-full rounded border border-edge bg-ink p-2 text-sm text-zinc-200"
                >
                  <option value="">— elige una voz —</option>
                  {heygenVoices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {heygenLoadError && <p className="text-xs text-red-400">{heygenLoadError}</p>}

            <label className="block text-sm text-zinc-300">
              Tope de gasto HeyGen/día (USD, 0 = sin tope)
              <input
                inputMode="numeric"
                value={String(s.heygenDailyUsdCap)}
                onChange={(e) => patch({ heygenDailyUsdCap: num(e.target.value) })}
                className="mt-1 w-full rounded border border-edge bg-ink p-2 text-sm text-zinc-200"
              />
            </label>

            {!s.heygenAvatarId || !s.heygenVoiceId ? (
              <p className="text-xs text-amber-400/80">⚠️ Elige avatar y voz para activar la generación automática.</p>
            ) : (
              <p className="text-xs text-emerald-400/80">✓ Listo: los guiones que apruebes generarán vídeo automáticamente.</p>
            )}
          </div>
        )}
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

      <Card title="📅 Ventana de publicación (auto-programación)">
        <p className="mb-3 text-xs text-zinc-500">
          Cuando un vídeo con avatar termina, se programa solo en el Calendario, espaciado
          1-3h del anterior. Esta ventana (hora UTC) evita que un hueco caiga de madrugada:
          si se sale de rango, salta al inicio de la ventana del día correspondiente.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-zinc-300">
            Desde (hora UTC)
            <input
              inputMode="numeric"
              value={String(s.postingWindowStartHour)}
              onChange={(e) => patch({ postingWindowStartHour: Math.min(23, num(e.target.value)) })}
              className="mt-1 w-full rounded border border-edge bg-ink p-2 text-sm text-zinc-200"
            />
          </label>
          <label className="text-sm text-zinc-300">
            Hasta (hora UTC)
            <input
              inputMode="numeric"
              value={String(s.postingWindowEndHour)}
              onChange={(e) => patch({ postingWindowEndHour: Math.min(24, num(e.target.value)) })}
              className="mt-1 w-full rounded border border-edge bg-ink p-2 text-sm text-zinc-200"
            />
          </label>
        </div>
      </Card>

      <Card title="🕵️ Espionaje de competencia">
        <p className="mb-3 text-xs text-zinc-500">
          Cuántos guiones de competencia como máximo se pueden adaptar en un día. Se resetea a medianoche
          (UTC) — al llegar al tope, los videos pendientes quedan en espera hasta entonces. Pon 0 para ilimitado.
        </p>
        <label className="text-sm text-zinc-300">
          Tope de guiones adaptados por día
          <input
            inputMode="numeric"
            value={String(s.competitorAdaptLimit)}
            onChange={(e) => patch({ competitorAdaptLimit: num(e.target.value) })}
            className="mt-1 w-full rounded border border-edge bg-ink p-2 text-sm text-zinc-200"
          />
        </label>
        <p className="mt-2 text-xs text-zinc-600">
          {s.competitorAdaptLimit === 0
            ? "Ilimitado: se adaptan todos los videos pendientes, sin tope diario."
            : `Hasta ${s.competitorAdaptLimit} guion(es) adaptado(s) al día, cuenten el ciclo automático, "Actualizar ahora" o el botón manual por video.`}
        </p>
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

      {status && s.hasHeygenKey && (
        <Card title="Gasto de hoy en HeyGen">
          <div className="mb-1 flex justify-between text-xs text-zinc-400">
            <span>Coste</span>
            <span>
              ${status.heygenBudget.costToday.toFixed(2)}
              {status.heygenBudget.maxUsd > 0 ? ` / $${status.heygenBudget.maxUsd.toFixed(2)}` : " (sin tope)"}
            </span>
          </div>
          <div className="h-2 rounded bg-edge">
            <div
              className="h-2 rounded bg-amber-500"
              style={{
                width:
                  status.heygenBudget.maxUsd > 0
                    ? `${Math.min(100, (status.heygenBudget.costToday / status.heygenBudget.maxUsd) * 100)}%`
                    : "0%",
              }}
            />
          </div>
          <p className="mt-2 text-xs text-zinc-500">{status.heygenBudget.videosToday} vídeo(s) generado(s) hoy.</p>
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
