"use client";
import { useEffect, useRef, useState } from "react";
import { usePoll, timeAgo } from "@/components/usePoll";
import type { CompetitorAccount, CompetitorScriptItem } from "@/lib/competitor";
import { PLATFORM_ICON, PLATFORM_LABEL, fmt, safeHref } from "@/lib/competitorUi";
import { buildScriptText } from "@/lib/scriptText";
import { PipelineStepper } from "@/components/PipelineStepper";
import { Modal } from "@/components/Modal";
import { StatusPill } from "@/components/StatusPill";
import { DRIVE_STATUSES } from "@/lib/driveUi";
import type { ContentItem } from "@/lib/contentItems";
import { SCRIPT_STATUSES, STATUS_LABEL } from "@/lib/status";
import { HeygenRenderStatus } from "@/components/HeygenRenderStatus";
import { HeygenBulkBar } from "@/components/HeygenBulkBar";

const PAGE_SIZE = 20;

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Todos los estados" },
  ...SCRIPT_STATUSES.map((st) => ({ value: st, label: STATUS_LABEL[st] })),
];

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

// Popup para asignar (o editar) la fecha/estado de subida de un guion en el
// calendario, sin salir de /adaptados. Si el guion ya tenía una publicación
// programada, la carga y la actualiza en vez de duplicarla.
function CalendarModal({ s, onClose }: { s: CompetitorScriptItem; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [existingId, setExistingId] = useState<number | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<string>("por_grabar");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/content-items?linkedType=competitor_script&linkedId=${s.id}`)
      .then((r) => r.json())
      .then((d: { items?: ContentItem[] }) => {
        const item = d.items?.[0];
        if (item) {
          setExistingId(item.id);
          setDate(item.scheduled_date);
          setStatus(item.status);
        }
      })
      .finally(() => setLoading(false));
  }, [s.id]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = existingId
        ? await fetch(`/api/content-items/${existingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scheduledDate: date, status }),
          })
        : await fetch(`/api/content-items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ linkedType: "competitor_script", linkedId: s.id, scheduledDate: date, status }),
          });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al guardar");
      setSaved(true);
      setTimeout(onClose, 900);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="📅 Añadir al calendario" onClose={onClose}>
      {loading ? (
        <p className="text-sm text-zinc-500">Cargando…</p>
      ) : (
        <div className="space-y-4">
          <p className="line-clamp-2 text-sm text-zinc-400">{s.title}</p>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">Fecha de subida</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded border border-edge bg-ink px-3 py-2 text-sm text-zinc-200"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">Estado</label>
            <div className="flex flex-wrap gap-2">
              {DRIVE_STATUSES.map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatus(st)}
                  className={`rounded-full transition ${status === st ? "" : "opacity-40 hover:opacity-80"}`}
                >
                  <StatusPill status={st} size="sm" />
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="rounded border border-edge px-3 py-1.5 text-sm text-zinc-400 hover:bg-panel2">
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50"
            >
              {saved ? "✓ Guardado" : saving ? "Guardando…" : existingId ? "Actualizar" : "Añadir"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// Popup para generar el enlace público de "guiones seleccionados", pensado
// para mandárselo de un tirón a un influencer/editor sin darle acceso a la app.
function ShareModal({ ids, onClose }: { ids: number[]; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/shared-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: ids.map((id) => ({ type: "competitor_script", id })), title: title || undefined }),
      });
      const json = (await res.json()) as { ok?: boolean; token?: string; error?: string };
      if (!res.ok || !json.token) throw new Error(json.error ?? "Error al crear el enlace");
      setUrl(`${window.location.origin}/compartido/${json.token}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Modal title="🔗 Compartir guiones" onClose={onClose}>
      <div className="space-y-4">
        {!url ? (
          <>
            <p className="text-sm text-zinc-400">
              Se generará un enlace público (sin login) con el texto completo de los {ids.length} guiones
              seleccionados — listo para enviarle al influencer o editor.
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Título (opcional)</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: Guiones semana 38"
                className="w-full rounded border border-edge bg-ink px-3 py-2 text-sm text-zinc-200"
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="rounded border border-edge px-3 py-1.5 text-sm text-zinc-400 hover:bg-panel2">
                Cancelar
              </button>
              <button
                onClick={create}
                disabled={creating}
                className="rounded bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50"
              >
                {creating ? "Generando…" : "Generar enlace"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-zinc-400">Enlace listo. Cópialo y compártelo:</p>
            <div className="flex items-center gap-2 rounded border border-edge bg-ink px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">{url}</span>
              <button onClick={copy} className="shrink-0 rounded bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand/90">
                {copied ? "✓ Copiado" : "Copiar"}
              </button>
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={onClose} className="rounded border border-edge px-3 py-1.5 text-sm text-zinc-400 hover:bg-panel2">
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function ScriptDoc({
  s,
  selected,
  onToggleSelect,
}: {
  s: CompetitorScriptItem;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const [status, setStatus] = useState(s.status);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

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
    <article className={`rounded-xl border p-5 transition ${selected ? "border-brand bg-brand/5" : "border-edge/70 bg-panel"}`}>
      <div className="flex gap-4">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            title="Seleccionar para compartir"
            className="h-4 w-4 shrink-0 cursor-pointer accent-brand"
          />
          {s.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.thumbnail_url} alt="" className="h-28 w-20 rounded-lg object-cover sm:h-32 sm:w-24" />
          ) : (
            <div className="flex h-28 w-20 items-center justify-center rounded-lg bg-ink text-3xl sm:h-32 sm:w-24">
              {PLATFORM_ICON[s.account_platform]}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            <span>{PLATFORM_ICON[s.account_platform]} @{s.account_handle}</span>
            <span className="ml-auto flex items-center gap-3">
              {s.views !== null && <span>👁 {fmt(s.views)}</span>}
              {s.comments !== null && <span>💬 {fmt(s.comments)}</span>}
              {s.viral_score !== null && <span>🔥 {s.viral_score}/100</span>}
            </span>
          </div>

          <div className="mb-3 flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded bg-brand2/15 px-1.5 py-0.5 text-[11px] font-medium text-brand2">
              {s.format === "reel" ? "Reel" : "YouTube"}
            </span>
            <h3 className="truncate text-base font-semibold text-white">{s.title}</h3>
          </div>

          <div className="mb-3 max-w-sm">
            <PipelineStepper status={status} onChange={changeStatus} />
          </div>

          {/* Vista previa (gancho) cuando el guion está colapsado. */}
          {!expanded && s.hook && <p className="mb-3 line-clamp-2 text-sm text-zinc-400">{s.hook}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={safeHref(s.video_url)}
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
            <button
              onClick={() => setShowCalendar(true)}
              className="rounded border border-edge px-2.5 py-1 text-xs text-zinc-400 hover:border-brand hover:text-brand"
            >
              📅 Calendario
            </button>
            <span className="ml-auto text-xs text-zinc-600">{timeAgo(s.created_at)}</span>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-edge/50 pt-4">
          <div className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-200">{buildScriptText(s)}</div>
          {s.adaptation_notes && <p className="text-xs italic text-zinc-600">{s.adaptation_notes}</p>}
          <HeygenRenderStatus type="competitor_script" id={s.id} />
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

      {showCalendar && <CalendarModal s={s} onClose={() => setShowCalendar(false)} />}
    </article>
  );
}

export default function AdaptadosPage() {
  const [sort, setSort] = useState("recent");
  const [accountFilter, setAccountFilter] = useState<number | undefined>(undefined);
  const [formatFilter, setFormatFilter] = useState("");
  // Filtro por estado del pipeline: por defecto "todos", pero deja excluir p.ej.
  // los ya grabados/subidos para centrarse en lo que aún queda pendiente.
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const [showShare, setShowShare] = useState(false);

  const { data: accountsData } = usePoll<{ accounts: CompetitorAccount[] }>("/api/competitors", 60000);
  const accounts = accountsData?.accounts ?? [];

  const params = new URLSearchParams({ sort, page: String(page), pageSize: String(PAGE_SIZE) });
  if (accountFilter) params.set("accountId", String(accountFilter));
  if (formatFilter) params.set("format", formatFilter);
  if (statusFilter) params.set("status", statusFilter);

  const { data, loading, refresh } = usePoll<{ scripts: CompetitorScriptItem[]; total: number; pages: number }>(
    `/api/competitors/scripts?${params.toString()}`,
    20000
  );
  const scripts = data?.scripts ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  // Resetea a página 1 cuando cambia cualquier filtro.
  useEffect(() => setPage(1), [sort, accountFilter, formatFilter, statusFilter]);

  function toggleSelect(id: number) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

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
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass()}>
          {STATUS_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <span className="ml-auto text-xs text-zinc-500">{loading ? "cargando…" : `${total} guiones`}</span>
      </div>

      {selected.length > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-brand/40 bg-brand/10 px-4 py-2.5">
          <span className="text-sm font-medium text-zinc-200">{selected.length} seleccionados</span>
          <button
            onClick={() => setShowShare(true)}
            className="rounded bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand/90"
          >
            🔗 Generar link para compartir
          </button>
          <button onClick={() => setSelected([])} className="ml-auto text-xs text-zinc-400 hover:text-zinc-200">
            Cancelar selección
          </button>
        </div>
      )}

      <HeygenBulkBar
        sourceType="competitor_script"
        selectedIds={selected}
        onClear={() => setSelected([])}
        onDone={refresh}
      />

      {scripts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-edge p-10 text-center text-zinc-500">
          <p className="mb-2 text-2xl">🗂️</p>
          <p className="text-sm">
            {accountFilter || formatFilter || statusFilter ? "No hay guiones con este filtro." : "Aún no hay guiones adaptados."}
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            Ve a Competencia → Videos, localiza uno ya analizado y pulsa "Generar guion adaptado".
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {scripts.map((s) => (
            <ScriptDoc key={s.id} s={s} selected={selected.includes(s.id)} onToggleSelect={() => toggleSelect(s.id)} />
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

      {showShare && (
        <ShareModal
          ids={selected}
          onClose={() => {
            setShowShare(false);
            setSelected([]);
          }}
        />
      )}
    </div>
  );
}
