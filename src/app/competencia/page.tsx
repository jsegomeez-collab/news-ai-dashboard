"use client";
import { useState, useCallback } from "react";
import { usePoll, timeAgo } from "@/components/usePoll";
import type { CompetitorAccount, CompetitorVideo, CompetitorScriptItem } from "@/lib/competitor";

// ─── helpers ─────────────────────────────────────────────────────────────────

const PLATFORMS: { id: string; label: string; placeholder: string; urlHint: string }[] = [
  { id: "tiktok",    label: "TikTok",    placeholder: "@creador",   urlHint: "https://www.tiktok.com/@usuario" },
  { id: "instagram", label: "Instagram", placeholder: "@creador",   urlHint: "https://www.instagram.com/usuario/" },
  { id: "youtube",   label: "YouTube",   placeholder: "@canal",     urlHint: "https://www.youtube.com/@canal" },
];

const PLATFORM_ICON: Record<string, string> = { tiktok: "🎵", instagram: "📸", youtube: "▶️" };

const STATUS_LABEL: Record<string, string> = {
  pending:      "Pendiente",
  transcribing: "Transcribiendo…",
  analysing:    "Analizando…",
  done:         "✓ Listo",
  error:        "Error",
  skipped:      "Omitido",
};
const STATUS_COLOR: Record<string, string> = {
  pending:      "bg-zinc-700 text-zinc-300",
  transcribing: "bg-amber-700 text-amber-100",
  analysing:    "bg-blue-700 text-blue-100",
  done:         "bg-emerald-700 text-white",
  error:        "bg-red-700 text-red-100",
  skipped:      "bg-zinc-700 text-zinc-400",
};

const SCRIPT_STATUS_LABEL: Record<string, string> = {
  borrador:     "Borrador",
  aprobado:     "Aprobado",
  pend_grabar:  "Pend. grabar",
  pend_edicion: "Pend. edición",
  pend_subida:  "Pend. subida",
  subido:       "Subido",
  descartado:   "Descartado",
};

function fmt(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

// ─── AddAccountForm ───────────────────────────────────────────────────────────

function AddAccountForm({ onAdded }: { onAdded: () => void }) {
  const [platform, setPlatform] = useState("tiktok");
  const [handle, setHandle]     = useState("");
  const [url, setUrl]           = useState("");
  const [minViews, setMinViews] = useState(50000);
  const [minComments, setMinComments] = useState(300);
  const [minLikes, setMinLikes] = useState(0);
  const [intervalH, setIntervalH] = useState(6);
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState("");

  const pl = PLATFORMS.find((p) => p.id === platform)!;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr("");
    try {
      const res = await fetch("/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, handle, url, min_views: minViews, min_likes: minLikes, min_comments: minComments, check_interval_hours: intervalH }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) { setErr(json.error ?? "Error"); return; }
      setHandle(""); setUrl(""); onAdded();
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-edge bg-panel p-4 space-y-4">
      <h3 className="font-semibold text-white text-sm">Añadir cuenta a espiar</h3>

      <div className="flex gap-2">
        {PLATFORMS.map((p) => (
          <button key={p.id} type="button" onClick={() => setPlatform(p.id)}
            className={`flex-1 rounded border px-3 py-2 text-sm font-medium transition ${platform === p.id ? "border-brand bg-brand/20 text-white" : "border-edge bg-ink text-zinc-400 hover:text-zinc-200"}`}>
            {PLATFORM_ICON[p.id]} {p.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-zinc-300">
          Handle
          <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder={pl.placeholder} required
            className="mt-1 w-full rounded border border-edge bg-ink p-2 text-sm text-zinc-200 outline-none focus:border-brand" />
        </label>
        <label className="text-sm text-zinc-300">
          URL del perfil
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={pl.urlHint} required
            className="mt-1 w-full rounded border border-edge bg-ink p-2 text-sm text-zinc-200 outline-none focus:border-brand" />
        </label>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase text-zinc-500">Umbrales mínimos para analizar un video</p>
        <div className="grid grid-cols-3 gap-3">
          {([
            ["👁 Vistas mín.", minViews, setMinViews, 0, 5_000_000, 10000] as const,
            ["❤️ Likes mín.", minLikes, setMinLikes, 0, 500_000, 1000] as const,
            ["💬 Comentarios mín.", minComments, setMinComments, 0, 50_000, 100] as const,
          ] as [string, number, (v: number) => void, number, number, number][]).map(([label, val, setter, min, max, step]) => (
            <label key={label} className="text-xs text-zinc-400">
              {label}
              <input type="number" min={min} max={max} step={step} value={val}
                onChange={(e) => setter(Number(e.target.value) || 0)}
                className="mt-1 w-full rounded border border-edge bg-ink p-2 text-sm text-zinc-200 outline-none focus:border-brand" />
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-zinc-600">Solo se analizan videos que superen TODOS los umbrales configurados.</p>
      </div>

      <div className="flex items-end gap-4">
        <label className="text-sm text-zinc-300">
          Revisar cada (horas)
          <input type="number" min={1} max={168} value={intervalH} onChange={(e) => setIntervalH(Math.max(1, Number(e.target.value) || 6))}
            className="mt-1 w-24 rounded border border-edge bg-ink p-2 text-sm text-zinc-200 outline-none focus:border-brand" />
        </label>
        <button type="submit" disabled={saving}
          className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? "Guardando…" : "Añadir cuenta"}
        </button>
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}
    </form>
  );
}

// ─── AccountCard ──────────────────────────────────────────────────────────────

function AccountCard({ account, onChanged }: { account: CompetitorAccount; onChanged: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing]   = useState(false);
  const [minV, setMinV] = useState(account.min_views);
  const [minL, setMinL] = useState(account.min_likes);
  const [minC, setMinC] = useState(account.min_comments);
  const [intH, setIntH] = useState(account.check_interval_hours);

  async function toggleActive() {
    await fetch(`/api/competitors/${account.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !account.active }),
    });
    onChanged();
  }
  async function del() {
    if (!confirm(`¿Eliminar @${account.handle}? Se borrarán todos sus videos y guiones adaptados.`)) return;
    setDeleting(true);
    await fetch(`/api/competitors/${account.id}`, { method: "DELETE" });
    onChanged();
  }
  async function saveEdit() {
    await fetch(`/api/competitors/${account.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ min_views: minV, min_likes: minL, min_comments: minC, check_interval_hours: intH }),
    });
    setEditing(false); onChanged();
  }

  return (
    <div className={`rounded-lg border bg-panel p-4 ${account.active ? "border-edge" : "border-zinc-800 opacity-60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">{PLATFORM_ICON[account.platform]}</span>
            <span className="font-semibold text-white">@{account.handle}</span>
            {account.display_name && <span className="text-xs text-zinc-500">{account.display_name}</span>}
          </div>
          <a href={account.url} target="_blank" rel="noreferrer" className="mt-0.5 text-xs text-zinc-500 hover:text-brand">{account.url}</a>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-zinc-600">{account.video_count} videos</span>
          <button onClick={toggleActive}
            className={`relative h-5 w-9 rounded-full transition ${account.active ? "bg-emerald-600" : "bg-edge"}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${account.active ? "left-[18px]" : "left-0.5"}`} />
          </button>
          <button onClick={() => setEditing(!editing)} className="rounded border border-edge px-2 py-0.5 text-xs text-zinc-400 hover:text-zinc-200">
            {editing ? "Cancelar" : "Editar"}
          </button>
          <button onClick={del} disabled={deleting} className="rounded border border-red-900/50 px-2 py-0.5 text-xs text-red-400 hover:text-red-300 disabled:opacity-40">
            {deleting ? "…" : "Eliminar"}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span>👁 ≥ {fmt(account.min_views)} vistas</span>
        <span>❤️ ≥ {fmt(account.min_likes)} likes</span>
        <span>💬 ≥ {fmt(account.min_comments)} coment.</span>
        <span>🔄 Cada {account.check_interval_hours}h</span>
        {account.last_checked_at && <span>Última revisión: {timeAgo(account.last_checked_at)}</span>}
      </div>

      {editing && (
        <div className="mt-4 border-t border-edge/60 pt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              ["👁 Vistas mín.", minV, setMinV, 0, 5_000_000, 10000] as const,
              ["❤️ Likes mín.", minL, setMinL, 0, 500_000, 1000] as const,
              ["💬 Coment. mín.", minC, setMinC, 0, 50_000, 100] as const,
              ["🔄 Intervalo (h)", intH, setIntH, 1, 168, 1] as const,
            ] as [string, number, (v: number) => void, number, number, number][]).map(([label, val, setter, min, max, step]) => (
              <label key={label} className="text-xs text-zinc-400">
                {label}
                <input type="number" min={min} max={max} step={step} value={val}
                  onChange={(e) => setter(Number(e.target.value) || 0)}
                  className="mt-1 w-full rounded border border-edge bg-ink p-1.5 text-sm text-zinc-200 outline-none focus:border-brand" />
              </label>
            ))}
          </div>
          <button onClick={saveEdit} className="rounded bg-brand px-4 py-1.5 text-sm font-semibold text-white">
            Guardar cambios
          </button>
        </div>
      )}
    </div>
  );
}

// ─── VideoCard ────────────────────────────────────────────────────────────────

function VideoCard({ video, onAnalyze, onTranscribe, transcribing }: {
  video: CompetitorVideo;
  onAnalyze: (id: number) => void;
  onTranscribe: (id: number) => void;
  transcribing: number | null;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article className="rounded-lg border border-edge bg-panel p-4">
      <div className="flex items-start gap-3">
        {video.thumbnail_url && (
          <img src={video.thumbnail_url} alt="" className="h-16 w-12 shrink-0 rounded object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <a href={video.video_url} target="_blank" rel="noreferrer"
              className="font-medium text-white hover:text-brand line-clamp-2">
              {video.title ?? video.video_url}
            </a>
            <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[video.status] ?? STATUS_COLOR.pending}`}>
              {STATUS_LABEL[video.status] ?? video.status}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500">
            <span>{PLATFORM_ICON[video.account_platform]} @{video.account_handle}</span>
            {video.views !== null && <span>👁 {fmt(video.views)}</span>}
            {video.likes !== null && <span>❤️ {fmt(video.likes)}</span>}
            {video.comments !== null && <span>💬 {fmt(video.comments)}</span>}
            {video.duration_sec && <span>⏱ {Math.floor(video.duration_sec / 60)}:{String(video.duration_sec % 60).padStart(2, "0")}</span>}
            <span>{timeAgo(video.fetched_at)}</span>
          </div>

          {video.status === "done" && video.viral_score !== null && (
            <div className="mt-2 flex items-center gap-3 text-xs">
              <span className={`rounded px-1.5 py-0.5 font-semibold ${video.viral_score >= 80 ? "bg-emerald-800 text-emerald-200" : video.viral_score >= 60 ? "bg-amber-800 text-amber-200" : "bg-zinc-700 text-zinc-300"}`}>
                🔥 Viral {video.viral_score}/100
              </span>
              {video.hook_type && <span className="text-zinc-500">{video.hook_type}</span>}
            </div>
          )}

          {video.status === "done" && video.winning_idea && (
            <p className="mt-2 text-sm text-zinc-300">
              <span className="text-zinc-500">💡 Idea:</span> {video.winning_idea}
            </p>
          )}

          {video.status === "done" && video.hook && (
            <p className="mt-1 text-sm text-zinc-400">
              <span className="text-zinc-500">🎣 Hook:</span> {video.hook}
            </p>
          )}

          {video.status === "error" && video.error_msg && (
            <p className="mt-1 text-xs text-red-400">{video.error_msg}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {video.status === "done" && (
              <button onClick={() => setExpanded(!expanded)}
                className="rounded border border-edge px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200">
                {expanded ? "Ocultar transcript" : "Ver transcript"}
              </button>
            )}
            {video.status === "done" && video.script_count > 0 && (
              <span className="rounded bg-brand2/20 px-2 py-0.5 text-xs text-brand2">
                {video.script_count} guion(es) generado(s)
              </span>
            )}
            {video.status === "done" && video.script_count === 0 && (
              <button onClick={() => onAnalyze(video.id)}
                className="rounded bg-brand2 px-3 py-1 text-xs font-semibold text-white">
                ✍️ Generar guion adaptado
              </button>
            )}
            {(video.status === "pending" || video.status === "error") && (
              <button
                onClick={() => onTranscribe(video.id)}
                disabled={transcribing === video.id}
                className="rounded bg-zinc-700 px-3 py-1 text-xs font-semibold text-zinc-200 hover:bg-zinc-600 disabled:opacity-50"
              >
                {transcribing === video.id ? "Transcribiendo…" : "🎙 Transcribir ahora"}
              </button>
            )}
          </div>

          {expanded && video.transcript && (
            <div className="mt-3 rounded border border-edge/60 bg-ink p-3">
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-400">{video.transcript}</p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// ─── ScriptCard ───────────────────────────────────────────────────────────────

function ScriptCard({ s }: { s: CompetitorScriptItem }) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState(s.status);

  async function changeStatus(st: string) {
    setStatus(st);
    await fetch(`/api/competitors/scripts/${s.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: st }),
    });
  }

  return (
    <article className="rounded-lg border border-edge bg-panel p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <span>{PLATFORM_ICON[s.account_platform]} @{s.account_handle}</span>
        <span>·</span>
        <a href={s.video_url} target="_blank" rel="noreferrer" className="hover:text-brand line-clamp-1 max-w-xs">
          {s.video_title ?? s.video_url}
        </a>
        {s.views !== null && <span className="ml-auto">👁 {fmt(s.views)}</span>}
        {s.comments !== null && <span>💬 {fmt(s.comments)}</span>}
        {s.viral_score !== null && <span>🔥 {s.viral_score}/100</span>}
      </div>

      {s.original_hook && (
        <p className="mb-2 rounded bg-zinc-800/60 px-3 py-1.5 text-xs text-zinc-400">
          <span className="text-zinc-500">Original hook:</span> {s.original_hook}
        </p>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded bg-brand2/20 px-1.5 py-0.5 text-xs font-semibold text-brand2">
              {s.format === "reel" ? "📱 Reel" : "▶️ YouTube"}
            </span>
            <span className="font-medium text-white">{s.title}</span>
          </div>
          {s.hook && <p className="mt-2 text-sm font-medium text-zinc-200">{s.hook}</p>}
        </div>
        <select value={status} onChange={(e) => changeStatus(e.target.value)}
          className="shrink-0 rounded border border-edge bg-ink px-2 py-1 text-xs text-zinc-300">
          {Object.entries(SCRIPT_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {s.adaptation_notes && (
        <p className="mt-2 rounded bg-amber-950/30 px-3 py-1.5 text-xs text-amber-300">
          <span className="text-amber-500">💡 Adaptación:</span> {s.adaptation_notes}
        </p>
      )}

      <button onClick={() => setExpanded(!expanded)}
        className="mt-3 text-xs text-zinc-500 hover:text-zinc-300">
        {expanded ? "▲ Ocultar guion" : "▼ Ver guion completo"}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 rounded border border-edge/60 bg-ink p-4">
          {s.body && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-zinc-500">Guion</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{s.body}</p>
            </div>
          )}
          {s.cta && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-zinc-500">CTA</p>
              <p className="text-sm text-zinc-300">{s.cta}</p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = "cuentas" | "videos" | "guiones";

export default function CompetenciaPage() {
  const [tab, setTab] = useState<Tab>("cuentas");
  const [accountFilter, setAccountFilter] = useState<number | undefined>(undefined);
  const [analyzing, setAnalyzing] = useState<number | null>(null);
  const [analyzeMsg, setAnalyzeMsg] = useState("");
  const [transcribing, setTranscribing] = useState<number | null>(null);
  const [polling, setPolling] = useState(false);
  const [pollMsg, setPollMsg] = useState("");

  const { data: accountsData, refresh: refreshAccounts } = usePoll<{ accounts: CompetitorAccount[] }>(
    "/api/competitors", 30000
  );
  const { data: videosData, refresh: refreshVideos } = usePoll<{ videos: CompetitorVideo[] }>(
    `/api/competitors/videos${accountFilter ? `?accountId=${accountFilter}` : ""}`, 15000
  );

  const accounts = accountsData?.accounts ?? [];
  const videos = videosData?.videos ?? [];

  const handlePoll = useCallback(async () => {
    setPolling(true); setPollMsg("");
    try {
      const res = await fetch("/api/competitors/poll", { method: "POST" });
      const json = await res.json() as { ok?: boolean; message?: string; inserted?: number; available?: boolean };
      setPollMsg(json.message ?? (json.ok ? "Hecho" : "Error"));
      if (json.inserted && json.inserted > 0) { refreshVideos(); }
    } finally { setPolling(false); }
  }, [refreshVideos]);

  const handleTranscribe = useCallback(async (videoId: number) => {
    setTranscribing(videoId); setAnalyzeMsg("");
    try {
      const res = await fetch(`/api/competitors/videos/${videoId}/transcribe`, { method: "POST" });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (json.ok) { setAnalyzeMsg("✓ Transcripción completada"); refreshVideos(); }
      else setAnalyzeMsg(json.error ?? "Error al transcribir");
    } finally { setTranscribing(null); }
  }, [refreshVideos]);

  const handleAnalyze = useCallback(async (videoId: number) => {
    setAnalyzing(videoId); setAnalyzeMsg("");
    try {
      const res = await fetch(`/api/competitors/videos/${videoId}/adapt`, { method: "POST" });
      const json = await res.json() as { ok?: boolean; generated?: number; error?: string };
      if (json.ok) { setAnalyzeMsg(`✓ ${json.generated} guion(es) generados`); refreshVideos(); }
      else setAnalyzeMsg(json.error ?? "Error al generar");
    } finally { setAnalyzing(null); }
  }, [refreshVideos]);

  const tabClass = (t: Tab) =>
    `-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
      tab === t ? "border-brand text-white" : "border-transparent text-zinc-400 hover:text-zinc-200"
    }`;

  const doneVideos = videos.filter((v) => v.status === "done");
  const pendingVideos = videos.filter((v) => v.status === "pending");

  return (
    <div>
      {/* Tabs internos */}
      <div className="mb-5 flex gap-1 border-b border-edge">
        <button onClick={() => setTab("cuentas")} className={tabClass("cuentas")}>
          🕵️ Cuentas ({accounts.length})
        </button>
        <button onClick={() => setTab("videos")} className={tabClass("videos")}>
          📹 Videos ({videos.length})
        </button>
        <button onClick={() => setTab("guiones")} className={tabClass("guiones")}>
          ✍️ Guiones adaptados
        </button>
      </div>

      {analyzeMsg && (
        <div className="mb-4 rounded border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
          {analyzeMsg}
        </div>
      )}
      {pollMsg && (
        <div className="mb-4 rounded border border-blue-800 bg-blue-950/40 px-3 py-2 text-sm text-blue-300">
          {pollMsg}
        </div>
      )}

      {/* ── CUENTAS ── */}
      {tab === "cuentas" && (
        <div className="space-y-4">
          {accounts.length > 0 && (
            <div className="flex items-center gap-3">
              <button onClick={handlePoll} disabled={polling}
                className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {polling ? "Buscando videos…" : "↻ Descubrir ahora"}
              </button>
              <span className="text-xs text-zinc-500">
                Busca videos nuevos en todas las cuentas que tengas programadas para revisión.
              </span>
            </div>
          )}
          <AddAccountForm onAdded={refreshAccounts} />

          {accounts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-edge p-8 text-center text-zinc-500">
              <p className="text-2xl mb-2">🕵️</p>
              <p className="text-sm">Añade tus primeras cuentas de competencia arriba.</p>
              <p className="mt-1 text-xs text-zinc-600">
                El sistema revisará sus videos automáticamente y filtrará los que superen tus umbrales.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((a) => (
                <AccountCard key={a.id} account={a} onChanged={refreshAccounts} />
              ))}
            </div>
          )}

          {accounts.length > 0 && (
            <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-4 text-sm text-amber-300/80">
              <p className="font-semibold mb-1">⚙️ Para activar el descubrimiento automático</p>
              <ul className="text-xs text-amber-400/70 space-y-1 list-disc pl-4">
                <li>
                  <b>📸 Instagram:</b> añade tu <b>token de Apify</b> en Ajustes (scraping seguro desde
                  servidor; no necesita yt-dlp).
                </li>
                <li>
                  <b>▶️ YouTube / 🎵 TikTok:</b> requieren <code className="bg-amber-950/60 px-1 rounded">yt-dlp</code> + <code className="bg-amber-950/60 px-1 rounded">ffmpeg</code> en el servidor{" "}
                  (<code className="bg-amber-950/60 px-1 rounded">brew install yt-dlp ffmpeg</code> en macOS).
                </li>
                <li>Para las transcripciones, añade tu <b>clave de OpenAI</b> en Ajustes.</li>
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── VIDEOS ── */}
      {tab === "videos" && (
        <div className="space-y-4">
          {/* filtros */}
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={handlePoll} disabled={polling}
              className="rounded bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
              {polling ? "Buscando…" : "↻ Descubrir"}
            </button>
            <select value={accountFilter ?? ""} onChange={(e) => setAccountFilter(e.target.value ? Number(e.target.value) : undefined)}
              className="rounded border border-edge bg-panel px-3 py-1.5 text-sm text-zinc-200">
              <option value="">Todas las cuentas</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{PLATFORM_ICON[a.platform]} @{a.handle}</option>
              ))}
            </select>
            <span className="text-xs text-zinc-500">
              {videos.length} videos · {doneVideos.length} analizados · {pendingVideos.length} pendientes
            </span>
            {analyzing !== null && (
              <span className="text-xs text-amber-400">Generando guion… un momento</span>
            )}
          </div>

          {videos.length === 0 ? (
            <div className="rounded-lg border border-dashed border-edge p-8 text-center text-zinc-500">
              <p className="text-2xl mb-2">📹</p>
              <p className="text-sm">No hay videos todavía.</p>
              <p className="mt-1 text-xs text-zinc-600">
                Los videos aparecerán aquí una vez que el worker descubra contenido viral de tus cuentas espiadas.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {videos.map((v) => (
                <VideoCard key={v.id} video={v}
                  onAnalyze={(id) => { setTab("guiones"); handleAnalyze(id); }}
                  onTranscribe={handleTranscribe}
                  transcribing={transcribing} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── GUIONES ADAPTADOS ── */}
      {tab === "guiones" && (
        <GuionesTab userId={undefined} />
      )}
    </div>
  );
}

// ─── GuionesTab (separated to allow future refresh) ──────────────────────────

function GuionesTab({ userId: _userId }: { userId: undefined }) {
  const { data } = usePoll<{ scripts: CompetitorScriptItem[] }>(
    "/api/competitors/scripts", 20000
  );
  const scripts = data?.scripts ?? [];

  if (scripts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-edge p-8 text-center text-zinc-500">
        <p className="text-2xl mb-2">✍️</p>
        <p className="text-sm">Aún no hay guiones adaptados.</p>
        <p className="mt-1 text-xs text-zinc-600">
          Ve a la pestaña Videos, localiza un video analizado y pulsa "Generar guion adaptado".
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {scripts.map((s) => (
        <ScriptCard key={s.id} s={s} />
      ))}
    </div>
  );
}
