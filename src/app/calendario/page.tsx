"use client";
import { useMemo, useRef, useState } from "react";
import { usePoll } from "@/components/usePoll";
import { DRIVE_STATUSES, DRIVE_STATUS_LABEL, driveKindIcon } from "@/lib/driveUi";
import { StatusPill } from "@/components/StatusPill";
import { LinkPicker, type LinkTargetLite } from "@/components/LinkPicker";

// Tipos locales (no se importan de @/lib/calendar ni @/lib/contentItems a
// propósito: esos módulos tocan la BD y no deben entrar en el bundle del
// navegador — estas formas son justo las que devuelven las rutas /api/*).
type CalendarItem = {
  date: string;
  source: "content" | "drive" | "script";
  id: number;
  title: string;
  status: string;
  kind: string | null;
  hasAudio: boolean;
  hasVideo: boolean;
};

type ContentItemFull = {
  id: number;
  linked_type: string | null;
  linked_id: number | null;
  title: string | null;
  status: string;
  scheduled_date: string;
  audio_path: string | null;
  audio_original_name: string | null;
  audio_mime: string | null;
  audio_size: number | null;
  video_path: string | null;
  video_original_name: string | null;
  video_mime: string | null;
  video_size: number | null;
  linked_title: string | null;
};

const MONTH_LABEL = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const WEEKDAY_LABEL = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// ─── Slot de audio o video dentro de una publicación ─────────────────────────

function MediaSlotEditor({
  itemId, slot, label, path, mime, originalName, size, onChange,
}: {
  itemId: number;
  slot: "audio" | "video";
  label: string;
  path: string | null;
  mime: string | null;
  originalName: string | null;
  size: number | null;
  onChange: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const url = `/api/content-items/${itemId}/media?slot=${slot}`;

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(url, { method: "POST", body: fd });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Error al subir");
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    await fetch(url, { method: "DELETE" });
    onChange();
  }

  return (
    <div className="rounded-lg border border-edge/60 bg-ink/50 p-2.5">
      <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-400">
        <span>{label}</span>
        {path && (
          <button onClick={remove} className="text-red-400 hover:underline">quitar</button>
        )}
      </div>
      {path ? (
        <>
          {slot === "video" ? (
            <video src={url} controls className="max-h-56 w-full rounded" />
          ) : (
            <audio src={url} controls className="w-full" />
          )}
          <p className="mt-1 truncate text-[11px] text-zinc-600">
            {originalName}
            {size ? ` · ${(size / 1024 / 1024).toFixed(1)}MB` : ""}
          </p>
        </>
      ) : (
        <label className="flex cursor-pointer items-center justify-center rounded border border-dashed border-edge py-3 text-center text-xs text-zinc-500 hover:border-brand hover:text-brand">
          {uploading ? "Subiendo…" : `Subir ${slot === "audio" ? "audio" : "video"}`}
          <input
            ref={inputRef}
            type="file"
            accept={slot === "audio" ? "audio/*" : "video/*"}
            className="hidden"
            onChange={upload}
            disabled={uploading}
          />
        </label>
      )}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ─── Tarjeta de una publicación (guion + audio + video + estado + fecha) ─────

function ContentItemCard({ id, onChange }: { id: number; onChange: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const { data, refresh } = usePoll<{ item: ContentItemFull }>(`/api/content-items/${id}`, 15000);
  const item = data?.item;
  const [status, setStatus] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/content-items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    refresh();
    onChange();
  }

  async function remove() {
    if (!window.confirm("¿Eliminar esta publicación? Se borrarán también su audio y su video. No se puede deshacer.")) return;
    await fetch(`/api/content-items/${id}`, { method: "DELETE" });
    onChange();
  }

  if (!item) return null;
  const curStatus = status ?? item.status;
  const curDate = date ?? item.scheduled_date;

  return (
    <div className={`rounded-xl border bg-panel transition ${expanded ? "border-brand/40" : "border-edge"}`}>
      <button onClick={() => setExpanded((e) => !e)} className="flex w-full items-center gap-3 p-3 text-left">
        <span className="text-xl">🎬</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{item.linked_title ?? item.title ?? "(sin título)"}</p>
          <p className="text-xs text-zinc-500">
            {item.audio_path ? "🎙️ audio" : "sin audio"} · {item.video_path ? "🎬 video" : "sin video"}
          </p>
        </div>
        <StatusPill status={item.status} size="sm" />
        <span className="shrink-0 text-xs text-zinc-500">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-edge/60 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-zinc-500">
              Estado
              <select
                value={curStatus}
                onChange={(e) => { setStatus(e.target.value); patch({ status: e.target.value }); }}
                className="mt-1 w-full rounded-lg border border-edge bg-ink px-2 py-1.5 text-sm text-zinc-200"
              >
                {DRIVE_STATUSES.map((s) => (
                  <option key={s} value={s}>{DRIVE_STATUS_LABEL[s]}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-500">
              Fecha
              <input
                type="date"
                value={curDate}
                onChange={(e) => { setDate(e.target.value); patch({ scheduledDate: e.target.value }); }}
                className="mt-1 w-full rounded-lg border border-edge bg-ink px-2 py-1.5 text-sm text-zinc-200"
              />
            </label>
          </div>

          <div>
            <p className="mb-1 text-xs text-zinc-500">Guion</p>
            <LinkPicker
              current={{ type: item.linked_type, title: item.linked_title }}
              onLink={(t) => patch({ linkedType: t.type, linkedId: t.id })}
              onUnlink={() => patch({ linkedType: null })}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <MediaSlotEditor
              itemId={item.id} slot="audio" label="🎙️ Audio (tu voz)"
              path={item.audio_path} mime={item.audio_mime} originalName={item.audio_original_name} size={item.audio_size}
              onChange={refresh}
            />
            <MediaSlotEditor
              itemId={item.id} slot="video" label="🎬 Video clonado"
              path={item.video_path} mime={item.video_mime} originalName={item.video_original_name} size={item.video_size}
              onChange={refresh}
            />
          </div>

          <div className="flex justify-end border-t border-edge/40 pt-2">
            <button onClick={remove} className="text-xs text-red-400 hover:underline">🗑 eliminar publicación</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Item de solo lectura: archivo de Drive programado, o guion publicado ────

function SimpleItemCard({ item, onChange }: { item: CalendarItem; onChange: () => void }) {
  const [date, setDate] = useState(item.date);

  async function reschedule(d: string) {
    setDate(d);
    await fetch(`/api/drive/files/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduledDate: d || null }),
    });
    onChange();
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-edge bg-panel p-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate text-zinc-200">
          {item.source === "drive" ? driveKindIcon(item.kind ?? "audio") : "📰"} {item.title}
        </p>
        <p className="text-xs text-zinc-500">{item.source === "drive" ? "Archivo de Drive programado" : "Publicado (métricas reales)"}</p>
      </div>
      <StatusPill status={item.status} size="sm" />
      {item.source === "drive" && (
        <input
          type="date"
          value={date}
          onChange={(e) => reschedule(e.target.value)}
          className="shrink-0 rounded-lg border border-edge bg-ink px-2 py-1 text-xs text-zinc-200"
        />
      )}
    </div>
  );
}

// ─── Formulario de nueva publicación ──────────────────────────────────────────

function CreateItemForm({ date, onCreated, onCancel }: { date: string; onCreated: () => void; onCancel: () => void }) {
  const [link, setLink] = useState<LinkTargetLite | null>(null);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!link && !title.trim()) {
      setError("Vincula un guion o ponle un título");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/content-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkedType: link?.type ?? null,
          linkedId: link?.id ?? null,
          title: link ? null : title,
          scheduledDate: date,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Error al crear");
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-brand/50 bg-panel p-3">
      <p className="text-xs font-medium text-zinc-300">➕ Nueva publicación — {date}</p>
      <LinkPicker
        current={link ? { type: link.type, title: link.title } : null}
        onLink={(t) => setLink(t)}
        onUnlink={() => setLink(null)}
        placeholder="Buscar guion (o escribe un título manual abajo)…"
      />
      {!link && (
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="…o ponle un título manual"
          className="w-full rounded-lg border border-edge bg-ink px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-brand"
        />
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex justify-end gap-3">
        <button onClick={onCancel} className="text-xs text-zinc-500 hover:text-zinc-300">cancelar</button>
        <button
          onClick={submit}
          disabled={saving}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Creando…" : "Crear"}
        </button>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function CalendarioPage() {
  const now = new Date();
  const [view, setView] = useState<"calendar" | "pipeline">("calendar");
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth()); // 0-11
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [creatingDate, setCreatingDate] = useState<string | null>(null);

  const monthParam = `${year}-${pad2(monthIndex + 1)}`;
  const { data, refresh } = usePoll<{ items: CalendarItem[] }>(`/api/calendar?month=${monthParam}`, 30000);
  const items = data?.items ?? [];

  // Vista Pipeline: todas las publicaciones (sin acotar por fecha), agrupadas
  // por estado — para ver de un vistazo qué está en grabación/edición/subida
  // ahora mismo, sin tener que ir mes a mes buscándolas en el grid.
  const { data: allData, refresh: refreshAll } = usePoll<{ items: ContentItemFull[] }>("/api/content-items", 20000);
  const allContentItems = allData?.items ?? [];
  const byStatus = (st: string) => allContentItems.filter((it) => it.status === st);

  const itemsByDate = useMemo(() => {
    const map: Record<string, CalendarItem[]> = {};
    for (const it of items) (map[it.date] ??= []).push(it);
    return map;
  }, [items]);

  function changeMonth(delta: number) {
    let m = monthIndex + delta;
    let y = year;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setMonthIndex(m);
    setYear(y);
    setSelectedDate(null);
    setCreatingDate(null);
  }

  function openDay(dateStr: string, create: boolean) {
    setSelectedDate(dateStr);
    setCreatingDate(create ? dateStr : null);
  }

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstWeekday = (new Date(year, monthIndex, 1).getDay() + 6) % 7; // 0=Lun
  const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${year}-${pad2(monthIndex + 1)}-${pad2(i + 1)}`),
  ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">📅 Calendario de contenido</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Lo que tienes programado y lo que ya has publicado de verdad, en un solo sitio.
          </p>
        </div>
        {view === "calendar" && (
          <div className="flex items-center gap-2">
            <button onClick={() => changeMonth(-1)} className="rounded-lg border border-edge bg-panel px-3 py-1.5 text-sm text-zinc-300 hover:border-brand">←</button>
            <span className="w-36 text-center text-sm font-medium text-white">
              {MONTH_LABEL[monthIndex]} {year}
            </span>
            <button onClick={() => changeMonth(1)} className="rounded-lg border border-edge bg-panel px-3 py-1.5 text-sm text-zinc-300 hover:border-brand">→</button>
          </div>
        )}
      </div>

      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => setView("calendar")}
          className={`rounded px-3 py-1.5 text-sm font-medium ${
            view === "calendar" ? "bg-brand text-white" : "bg-panel text-zinc-300"
          }`}
        >
          📅 Calendario
        </button>
        <button
          onClick={() => setView("pipeline")}
          className={`rounded px-3 py-1.5 text-sm font-medium ${
            view === "pipeline" ? "bg-brand text-white" : "bg-panel text-zinc-300"
          }`}
        >
          🔀 Pipeline (en grabación)
        </button>
        {view === "pipeline" && (
          <span className="ml-auto text-xs text-zinc-500">{allContentItems.length} publicaciones</span>
        )}
      </div>

      {view === "pipeline" ? (
        <div className="relative">
          <p className="mb-2 text-xs text-zinc-600">⟷ desliza para ver el resto de estados</p>
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4">
            {DRIVE_STATUSES.map((st) => {
              const col = byStatus(st);
              return (
                <div key={st} className="w-80 shrink-0 snap-start">
                  <div className="mb-2 flex items-center gap-2">
                    <StatusPill status={st} size="sm" />
                    <span className="text-xs text-zinc-500">{col.length}</span>
                  </div>
                  <div className="space-y-2">
                    {col.map((it) => (
                      <ContentItemCard key={it.id} id={it.id} onChange={refreshAll} />
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
        <>
        <div className="grid grid-cols-7 gap-1.5 text-center text-xs text-zinc-500">
          {WEEKDAY_LABEL.map((w) => (
            <div key={w} className="pb-1">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((dateStr, i) => {
            if (!dateStr) return <div key={`empty-${i}`} />;
            const dayItems = itemsByDate[dateStr] ?? [];
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            return (
              <div
                key={dateStr}
                className={`group relative min-h-20 rounded-xl border p-1.5 text-left transition ${
                  isSelected ? "border-brand bg-panel2" : isToday ? "border-brand/50 bg-panel" : "border-edge bg-panel hover:border-edge"
                }`}
              >
                <button onClick={() => openDay(dateStr, false)} className="block w-full text-left">
                  <div className={`text-xs ${isToday ? "font-semibold text-brand" : "text-zinc-500"}`}>{Number(dateStr.slice(-2))}</div>
                  <div className="mt-1 space-y-0.5">
                    {dayItems.slice(0, 3).map((it) => (
                      <div
                        key={`${it.source}-${it.id}`}
                        className={`truncate rounded px-1 text-[10px] font-medium ${
                          it.status === "subido" ? "bg-emerald-500/20 text-emerald-300"
                          : it.status === "por_subir" ? "bg-brand/20 text-brand"
                          : it.status === "editando" ? "bg-amber-500/20 text-amber-300"
                          : "bg-zinc-700/60 text-zinc-300"
                        }`}
                      >
                        {it.title}
                      </div>
                    ))}
                    {dayItems.length > 3 && <div className="text-[10px] text-zinc-600">+{dayItems.length - 3} más</div>}
                  </div>
                </button>
                <button
                  onClick={() => openDay(dateStr, true)}
                  title="Añadir publicación este día"
                  className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-brand text-xs font-bold text-white opacity-0 shadow-[0_0_10px_-2px_rgba(59,130,246,0.8)] transition group-hover:flex group-hover:opacity-100"
                >
                  +
                </button>
              </div>
            );
          })}
        </div>

        {selectedDate && (
          <div className="mt-4 space-y-3 rounded-xl border border-edge bg-panel p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">{selectedDate}</h3>
              {!creatingDate && (
                <button
                  onClick={() => setCreatingDate(selectedDate)}
                  className="rounded-lg border border-edge px-2.5 py-1 text-xs text-zinc-300 hover:border-brand hover:text-brand"
                >
                  ＋ Añadir publicación
                </button>
              )}
            </div>

            {creatingDate && (
              <CreateItemForm
                date={creatingDate}
                onCancel={() => setCreatingDate(null)}
                onCreated={() => { setCreatingDate(null); refresh(); }}
              />
            )}

            {(itemsByDate[selectedDate] ?? []).length === 0 && !creatingDate ? (
              <p className="text-sm text-zinc-500">Nada programado este día.</p>
            ) : (
              <div className="space-y-2">
                {(itemsByDate[selectedDate] ?? []).map((it) =>
                  it.source === "content" ? (
                    <ContentItemCard key={`content-${it.id}`} id={it.id} onChange={refresh} />
                  ) : (
                    <SimpleItemCard key={`${it.source}-${it.id}`} item={it} onChange={refresh} />
                  )
                )}
              </div>
            )}
          </div>
        )}
        </>
      )}
    </div>
  );
}
