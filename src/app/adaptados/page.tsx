"use client";
import { useEffect, useRef, useState } from "react";
import { usePoll, timeAgo } from "@/components/usePoll";
import type { CompetitorAccount, CompetitorScriptItem } from "@/lib/competitor";
import { PLATFORM_ICON, PLATFORM_LABEL, SCRIPT_STATUS_LABEL, fmt } from "@/lib/competitorUi";
import { buildScriptText } from "@/lib/scriptText";

const PAGE_SIZE = 20;

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "recent", label: "Más recientes" },
  { value: "views", label: "Más vistas" },
  { value: "comments", label: "Más comentarios" },
  { value: "likes", label: "Más likes" },
  { value: "viral", label: "Mayor puntuación viral" },
];

const FORMAT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Todos los formatos" },
  { value: "reel", label: "📱 Reel" },
  { value: "youtube", label: "▶️ YouTube" },
];

type Media = Pick<CompetitorScriptItem, "media_path" | "media_original_name" | "media_mime" | "media_size">;

// Audio/video que el usuario graba leyendo el guion, para que el editor lo
// agarre desde ahí y lo use como referencia de clonación con IA.
function MediaUpload({ scriptId, initial }: { scriptId: number; initial: Media }) {
  const [media, setMedia] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/competitors/scripts/${scriptId}/media`, { method: "POST", body: fd });
      const json = (await res.json()) as { ok?: boolean; originalName?: string; size?: number; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Error al subir el archivo");
      setMedia({ media_path: "ok", media_original_name: json.originalName ?? file.name, media_mime: file.type, media_size: json.size ?? file.size });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    if (!window.confirm("¿Quitar el audio/video subido?")) return;
    await fetch(`/api/competitors/scripts/${scriptId}/media`, { method: "DELETE" });
    setMedia({ media_path: null, media_original_name: null, media_mime: null, media_size: null });
  }

  const fileUrl = `/api/competitors/scripts/${scriptId}/media`;
  const hasMedia = !!media.media_path;
  const isVideo = media.media_mime?.startsWith("video/") ?? false;

  return (
    <div className="rounded-lg border border-edge/60 bg-ink/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400">
          🎙️ Tu audio/video leyendo el guion <span className="text-zinc-600">(para que el editor lo clone)</span>
        </span>
        {hasMedia && (
          <button onClick={remove} className="text-xs text-red-400 hover:underline">
            quitar
          </button>
        )}
      </div>

      {hasMedia ? (
        <div className="space-y-2">
          {isVideo ? (
            <video src={fileUrl} controls className="max-h-72 w-full rounded" />
          ) : (
            <audio src={fileUrl} controls className="w-full" />
          )}
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span className="truncate">
              {media.media_original_name}
              {media.media_size ? ` · ${(media.media_size / 1024 / 1024).toFixed(1)}MB` : ""}
            </span>
            <a href={fileUrl} download={media.media_original_name ?? undefined} className="shrink-0 text-brand hover:underline">
              descargar
            </a>
          </div>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center justify-center rounded border border-dashed border-edge py-4 text-center text-xs text-zinc-500 hover:border-brand hover:text-brand">
          {uploading ? "Subiendo…" : "Subir el audio o video donde grabaste el guion"}
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,video/*"
            className="hidden"
            onChange={handleFile}
            disabled={uploading}
          />
        </label>
      )}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

function ScriptDoc({ s }: { s: CompetitorScriptItem }) {
  const [status, setStatus] = useState(s.status);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function changeStatus(st: string) {
    setStatus(st);
    await fetch(`/api/competitors/scripts/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: st }),
    });
  }

  async function copy() {
    await navigator.clipboard.writeText(buildScriptText(s));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <article className="rounded-xl border border-edge/70 bg-panel p-5">
      <div className="flex gap-4">
        {s.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.thumbnail_url} alt="" className="h-28 w-20 shrink-0 rounded-lg object-cover sm:h-32 sm:w-24" />
        ) : (
          <div className="flex h-28 w-20 shrink-0 items-center justify-center rounded-lg bg-ink text-3xl sm:h-32 sm:w-24">
            {PLATFORM_ICON[s.account_platform]}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            <span>{PLATFORM_ICON[s.account_platform]} @{s.account_handle}</span>
            <span className="ml-auto flex items-center gap-3">
              {s.views !== null && <span>👁 {fmt(s.views)}</span>}
              {s.comments !== null && <span>💬 {fmt(s.comments)}</span>}
              {s.viral_score !== null && <span>🔥 {s.viral_score}/100</span>}
            </span>
          </div>

          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 rounded bg-brand2/15 px-1.5 py-0.5 text-[11px] font-medium text-brand2">
                {s.format === "reel" ? "Reel" : "YouTube"}
              </span>
              <h3 className="truncate text-base font-semibold text-white">{s.title}</h3>
            </div>
            <select
              value={status}
              onChange={(e) => changeStatus(e.target.value)}
              className="shrink-0 rounded border-none bg-transparent py-0.5 text-xs text-zinc-500 outline-none hover:text-zinc-300"
            >
              {Object.entries(SCRIPT_STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k} className="bg-panel">{v}</option>
              ))}
            </select>
          </div>

          {/* Vista previa (gancho) cuando el guion está colapsado. */}
          {!expanded && s.hook && <p className="mb-3 line-clamp-2 text-sm text-zinc-400">{s.hook}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={s.video_url}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-edge px-2.5 py-1 text-xs text-zinc-300 hover:border-brand hover:text-brand"
            >
              ↗ Ver en {PLATFORM_LABEL[s.account_platform] ?? s.account_platform}
            </a>
            <button
              onClick={() => setExpanded((e) => !e)}
              className="rounded border border-edge px-2.5 py-1 text-xs text-zinc-300 hover:border-brand hover:text-brand"
            >
              {expanded ? "▲ Ocultar guion" : "▼ Ver guion completo"}
            </button>
            {expanded && (
              <button
                onClick={copy}
                className="rounded border border-edge px-2.5 py-1 text-xs text-zinc-400 hover:border-brand hover:text-brand"
              >
                {copied ? "✓ Copiado" : "📋 Copiar guion"}
              </button>
            )}
            <span className="ml-auto text-xs text-zinc-600">{timeAgo(s.created_at)}</span>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-edge/50 pt-4">
          <div className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-200">{buildScriptText(s)}</div>
          {s.adaptation_notes && <p className="text-xs italic text-zinc-600">{s.adaptation_notes}</p>}
          <MediaUpload
            scriptId={s.id}
            initial={{
              media_path: s.media_path,
              media_original_name: s.media_original_name,
              media_mime: s.media_mime,
              media_size: s.media_size,
            }}
          />
        </div>
      )}
    </article>
  );
}

export default function AdaptadosPage() {
  const [sort, setSort] = useState("recent");
  const [accountFilter, setAccountFilter] = useState<number | undefined>(undefined);
  const [formatFilter, setFormatFilter] = useState("");
  const [page, setPage] = useState(1);

  const { data: accountsData } = usePoll<{ accounts: CompetitorAccount[] }>("/api/competitors", 60000);
  const accounts = accountsData?.accounts ?? [];

  const params = new URLSearchParams({ sort, page: String(page), pageSize: String(PAGE_SIZE) });
  if (accountFilter) params.set("accountId", String(accountFilter));
  if (formatFilter) params.set("format", formatFilter);

  const { data, loading } = usePoll<{ scripts: CompetitorScriptItem[]; total: number; pages: number }>(
    `/api/competitors/scripts?${params.toString()}`,
    20000
  );
  const scripts = data?.scripts ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  // Resetea a página 1 cuando cambia cualquier filtro.
  useEffect(() => setPage(1), [sort, accountFilter, formatFilter]);

  function selectClass(extra = "") {
    return `rounded border border-edge bg-panel px-3 py-1.5 text-sm text-zinc-200 ${extra}`;
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-white">Guiones adaptados</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Guiones creados a partir de videos virales de tu competencia, listos para grabar.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <select value={sort} onChange={(e) => setSort(e.target.value)} className={selectClass()}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={accountFilter ?? ""}
          onChange={(e) => setAccountFilter(e.target.value ? Number(e.target.value) : undefined)}
          className={selectClass()}
        >
          <option value="">Todas las cuentas</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{PLATFORM_ICON[a.platform]} @{a.handle}</option>
          ))}
        </select>
        <select value={formatFilter} onChange={(e) => setFormatFilter(e.target.value)} className={selectClass()}>
          {FORMAT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <span className="ml-auto text-xs text-zinc-500">{loading ? "cargando…" : `${total} guiones`}</span>
      </div>

      {scripts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-edge p-10 text-center text-zinc-500">
          <p className="mb-2 text-2xl">🗂️</p>
          <p className="text-sm">
            {accountFilter || formatFilter ? "No hay guiones con este filtro." : "Aún no hay guiones adaptados."}
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            Ve a Competencia → Videos, localiza uno ya analizado y pulsa "Generar guion adaptado".
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {scripts.map((s) => (
            <ScriptDoc key={s.id} s={s} />
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded border border-edge bg-panel px-3 py-1.5 text-sm text-zinc-300 disabled:opacity-40"
          >
            ← Anterior
          </button>
          <span className="text-sm text-zinc-400">Página {page} de {pages}</span>
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page >= pages}
            className="rounded border border-edge bg-panel px-3 py-1.5 text-sm text-zinc-300 disabled:opacity-40"
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
