"use client";
import { useState } from "react";
import { usePoll, timeAgo } from "@/components/usePoll";
import type { ScriptItem } from "@/lib/queries";
import {
  SCRIPT_STATUSES,
  STATUS_LABEL,
  STATUS_COLOR,
  type ScriptStatus,
} from "@/lib/status";
import { buildScriptText } from "@/lib/scriptText";
import { HeygenRenderStatus } from "@/components/HeygenRenderStatus";

function scoreColor(s: number | null): string {
  if (s === null) return "bg-zinc-700 text-zinc-300";
  if (s >= 8) return "bg-emerald-600 text-white";
  if (s >= 6) return "bg-brand text-white";
  if (s >= 4) return "bg-amber-600 text-white";
  return "bg-red-700 text-white";
}

function engagement(s: ScriptItem): number {
  return (
    (s.views ?? 0) +
    (s.likes ?? 0) * 3 +
    (s.comments ?? 0) * 5 +
    (s.shares ?? 0) * 8 +
    (s.new_followers ?? 0) * 20
  );
}

function MetricsForm({ s, onSaved }: { s: ScriptItem; onSaved: () => void }) {
  const [m, setM] = useState({
    views: s.views ?? 0,
    likes: s.likes ?? 0,
    comments: s.comments ?? 0,
    shares: s.shares ?? 0,
    new_followers: s.new_followers ?? 0,
    notes: s.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) =>
    setM((p) => ({ ...p, [k]: k === "notes" ? v : Number(v.replace(/\D/g, "")) || 0 }));

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/scripts/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metrics: { ...m, published_at: s.published_at ?? new Date().toISOString() } }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const fields: [string, keyof typeof m, string][] = [
    ["👁 Views", "views", "views"],
    ["❤️ Likes", "likes", "likes"],
    ["💬 Coment.", "comments", "comentarios"],
    ["🔁 Comp.", "shares", "compartidos"],
    ["➕ Seguidores", "new_followers", "nuevos seguidores"],
  ];

  return (
    <div className="rounded bg-ink/60 p-3">
      <div className="mb-2 text-xs uppercase text-zinc-500">Resultados reales (rellénalos tras publicar)</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {fields.map(([label, key, ph]) => (
          <label key={key} className="text-xs text-zinc-400">
            {label}
            <input
              inputMode="numeric"
              value={String(m[key])}
              onChange={(e) => set(key, e.target.value)}
              placeholder={ph}
              className="mt-1 w-full rounded border border-edge bg-ink p-1.5 text-sm text-zinc-200 outline-none focus:border-brand"
            />
          </label>
        ))}
      </div>
      <input
        value={m.notes}
        onChange={(e) => set("notes", e.target.value)}
        placeholder="Notas (qué crees que funcionó/falló)"
        className="mt-2 w-full rounded border border-edge bg-ink p-1.5 text-sm text-zinc-200 outline-none focus:border-brand"
      />
      <div className="mt-2 flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar resultados"}
        </button>
      </div>
    </div>
  );
}

function ScriptCard({ s, onChange }: { s: ScriptItem; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const eng = engagement(s);

  async function setStatus(status: string) {
    await fetch(`/api/scripts/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    onChange();
  }

  return (
    <div className="rounded-lg border border-edge bg-panel p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded bg-edge px-1.5 py-0.5 uppercase text-zinc-300">
              {s.format === "reel" ? "IG/Reel" : "YouTube"}
            </span>
            {eng > 0 && <span className="text-emerald-400">🔥 {eng.toLocaleString()}</span>}
          </div>
          <h3 className="mt-1 truncate font-medium text-white" title={s.title ?? ""}>
            {s.title || "(sin título)"}
          </h3>
        </div>
        <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold ${scoreColor(s.score)}`}>
          {s.score !== null ? s.score.toFixed(1) : "…"}
        </span>
      </div>

      <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{s.hook}</p>

      <div className="mt-2 flex items-center gap-2">
        <select
          value={s.status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded border border-edge bg-ink px-1.5 py-1 text-xs text-zinc-200"
        >
          {SCRIPT_STATUSES.map((st) => (
            <option key={st} value={st}>
              {STATUS_LABEL[st]}
            </option>
          ))}
        </select>
        <button onClick={() => setOpen((o) => !o)} className="text-xs text-brand hover:underline">
          {open ? "ocultar" : "abrir"}
        </button>
        <span className="ml-auto text-xs text-zinc-600">{timeAgo(s.created_at)}</span>
      </div>

      {open && (
        <div className="mt-3 space-y-3 border-t border-edge pt-3">
          {/* El guion como UN bloque de texto corrido (gancho→cuerpo→CTA), no
              como campos sueltos con etiquetas — así se lee como el guion que
              vas a grabar, no como un formulario. */}
          <p className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-200">
            {buildScriptText({ hook: s.hook, body: s.body, cta: s.cta })}
          </p>
          {(s.strengths || s.weaknesses || s.improvements) && (
            <div className="rounded bg-ink/60 p-3 text-sm">
              <div className="text-xs uppercase text-zinc-500">
                Crítica del director · tono {s.tone_match?.toFixed(1) ?? "—"}/10
              </div>
              {s.strengths && <p className="mt-1 text-emerald-300">✓ {s.strengths}</p>}
              {s.weaknesses && <p className="mt-1 text-amber-300">⚠ {s.weaknesses}</p>}
              {s.improvements && <p className="mt-1 text-brand2">→ {s.improvements}</p>}
            </div>
          )}
          <HeygenRenderStatus type="script" id={s.id} />
          <MetricsForm s={s} onSaved={onChange} />
          {s.article_url && (
            <a
              href={s.article_url}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-xs text-zinc-500 hover:text-zinc-300"
            >
              noticia origen ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default function GuionesPage() {
  const [view, setView] = useState<"pipeline" | "top">("pipeline");
  const { data, loading, refresh } = usePoll<{ items: ScriptItem[] }>(`/api/scripts?limit=300`, 30000);
  const items = data?.items ?? [];

  const byStatus = (st: ScriptStatus) => items.filter((s) => s.status === st);
  const topItems = [...items]
    .filter((s) => engagement(s) > 0)
    .sort((a, b) => engagement(b) - engagement(a));

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => setView("pipeline")}
          className={`rounded px-3 py-1.5 text-sm font-medium ${
            view === "pipeline" ? "bg-brand text-white" : "bg-panel text-zinc-300"
          }`}
        >
          Pipeline
        </button>
        <button
          onClick={() => setView("top")}
          className={`rounded px-3 py-1.5 text-sm font-medium ${
            view === "top" ? "bg-brand text-white" : "bg-panel text-zinc-300"
          }`}
        >
          🏆 Mejores resultados
        </button>
        <span className="ml-auto text-xs text-zinc-500">
          {loading ? "cargando…" : `${items.length} guiones`} · autorefresco 30s
        </span>
      </div>

      {view === "pipeline" ? (
        <div className="relative">
          {/* 7 columnas de 18rem no caben en ningún viewport normal (~2100px
              necesarios) — sin este aviso + degradado, nada indica que hay
              más estados fuera de pantalla a la derecha (en móvil esto
              cortaba la 2ª columna a la mitad sin ninguna pista). */}
          <p className="mb-2 text-xs text-zinc-600">⟷ desliza para ver el resto de estados</p>
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4">
            {SCRIPT_STATUSES.map((st) => {
              const col = byStatus(st);
              return (
                <div key={st} className="w-72 shrink-0 snap-start">
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: STATUS_COLOR[st] }}
                    />
                    <h3 className="text-sm font-semibold text-white">{STATUS_LABEL[st]}</h3>
                    <span className="text-xs text-zinc-500">{col.length}</span>
                  </div>
                  <div className="space-y-2">
                    {col.map((s) => (
                      <ScriptCard key={s.id} s={s} onChange={refresh} />
                    ))}
                    {col.length === 0 && (
                      <div className="rounded border border-dashed border-edge p-3 text-center text-xs text-zinc-600">
                        vacío
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="pointer-events-none absolute right-0 top-6 bottom-4 w-10 bg-gradient-to-l from-ink to-transparent" />
        </div>
      ) : (
        <div className="grid gap-3">
          {topItems.map((s) => (
            <ScriptCard key={s.id} s={s} onChange={refresh} />
          ))}
          {topItems.length === 0 && (
            <p className="text-sm text-zinc-500">
              Aún no hay resultados. Abre un guion publicado y mete sus métricas (views, likes…) para que Claude aprenda qué funciona.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
