"use client";
import { useEffect, useRef, useState } from "react";
import { usePoll, timeAgo } from "@/components/usePoll";
import type { DriveFolder, DriveFile, LinkTarget } from "@/lib/drive";
import { DRIVE_STATUSES, DRIVE_STATUS_LABEL, DRIVE_STATUS_COLOR, driveKindIcon, fmtBytes } from "@/lib/driveUi";

function LinkPicker({ file, onChange }: { file: DriveFile; onChange: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LinkTarget[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/drive/search?q=${encodeURIComponent(query)}`);
      const json = (await res.json()) as { results?: LinkTarget[] };
      setResults(json.results ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [query, open]);

  async function link(target: LinkTarget) {
    await fetch(`/api/drive/files/${file.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkedType: target.type, linkedId: target.id }),
    });
    setOpen(false);
    setQuery("");
    onChange();
  }

  async function unlink() {
    await fetch(`/api/drive/files/${file.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkedType: null }),
    });
    onChange();
  }

  if (file.linked_type && !open) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-brand2/15 px-2 py-0.5 text-brand2">
          {file.linked_type === "script" ? "📰" : "🕵️"} {file.linked_title ?? `#${file.linked_id}`}
        </span>
        <button onClick={() => setOpen(true)} className="text-zinc-500 hover:underline">cambiar</button>
        <button onClick={unlink} className="text-red-400 hover:underline">quitar</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar un guion para vincular…"
        className="w-full rounded border border-edge bg-ink px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-brand"
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded border border-edge bg-panel shadow-lg">
          {results.length === 0 ? (
            <p className="px-2 py-2 text-xs text-zinc-600">
              {query.trim().length < 2 ? "Escribe al menos 2 letras…" : "Sin resultados"}
            </p>
          ) : (
            results.map((r) => (
              <button
                key={`${r.type}-${r.id}`}
                onClick={() => link(r)}
                className="block w-full truncate px-2 py-1.5 text-left text-xs text-zinc-300 hover:bg-panel2"
              >
                {r.type === "script" ? "📰" : "🕵️"} {r.title}
              </button>
            ))
          )}
          <button onClick={() => setOpen(false)} className="block w-full border-t border-edge/50 px-2 py-1 text-center text-[11px] text-zinc-600 hover:text-zinc-400">
            cerrar
          </button>
        </div>
      )}
    </div>
  );
}

function FileRow({ file, onChange }: { file: DriveFile; onChange: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState(file.status);
  const [date, setDate] = useState(file.scheduled_date ?? "");

  async function changeStatus(s: string) {
    setStatus(s);
    await fetch(`/api/drive/files/${file.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: s }),
    });
    onChange();
  }

  async function changeDate(d: string) {
    setDate(d);
    await fetch(`/api/drive/files/${file.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduledDate: d || null }),
    });
    onChange();
  }

  async function remove() {
    if (!window.confirm(`¿Eliminar "${file.original_name}"? No se puede deshacer.`)) return;
    await fetch(`/api/drive/files/${file.id}`, { method: "DELETE" });
    onChange();
  }

  const url = `/api/drive/files/${file.id}/content`;

  return (
    <div className="rounded-lg border border-edge bg-panel p-3">
      <button onClick={() => setExpanded((e) => !e)} className="flex w-full items-center gap-3 text-left">
        <span className="text-xl">{driveKindIcon(file.kind)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{file.original_name}</p>
          <p className="text-xs text-zinc-500">
            {fmtBytes(file.size)} · {timeAgo(file.uploaded_at)}
            {file.linked_title ? ` · vinculado a "${file.linked_title}"` : ""}
          </p>
        </div>
        {file.scheduled_date && <span className="shrink-0 text-xs text-zinc-500">📅 {file.scheduled_date}</span>}
        <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${DRIVE_STATUS_COLOR[file.status] ?? DRIVE_STATUS_COLOR.por_grabar}`}>
          {DRIVE_STATUS_LABEL[file.status] ?? file.status}
        </span>
        <span className="shrink-0 text-xs text-zinc-500">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-edge/50 pt-3">
          {file.kind === "video" ? (
            <video src={url} controls className="max-h-72 w-full rounded" />
          ) : (
            <audio src={url} controls className="w-full" />
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-zinc-500">
              Estado
              <select
                value={status}
                onChange={(e) => changeStatus(e.target.value)}
                className="mt-1 w-full rounded border border-edge bg-ink px-2 py-1.5 text-sm text-zinc-200"
              >
                {DRIVE_STATUSES.map((s) => (
                  <option key={s} value={s}>{DRIVE_STATUS_LABEL[s]}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-500">
              Fecha (grabación/publicación)
              <input
                type="date"
                value={date}
                onChange={(e) => changeDate(e.target.value)}
                className="mt-1 w-full rounded border border-edge bg-ink px-2 py-1.5 text-sm text-zinc-200"
              />
            </label>
          </div>

          <div>
            <p className="mb-1 text-xs text-zinc-500">Vinculado a un guion</p>
            <LinkPicker file={file} onChange={onChange} />
          </div>

          <div className="flex items-center justify-between border-t border-edge/40 pt-2">
            <a href={url} download={file.original_name} className="text-xs text-brand hover:underline">
              ⬇ descargar
            </a>
            <button onClick={remove} className="text-xs text-red-400 hover:underline">
              🗑 eliminar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DrivePage() {
  const [folderId, setFolderId] = useState<number | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, refresh } = usePoll<{ breadcrumb: DriveFolder[]; folders: DriveFolder[]; files: DriveFile[] }>(
    `/api/drive${folderId ? `?folderId=${folderId}` : ""}`,
    20000
  );
  const breadcrumb = data?.breadcrumb ?? [];
  const folders = data?.folders ?? [];
  const files = data?.files ?? [];

  async function createFolder() {
    if (!newFolderName.trim()) return;
    await fetch("/api/drive/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newFolderName, parentId: folderId }),
    });
    setNewFolderName("");
    setShowNewFolder(false);
    refresh();
  }

  async function renameFolderPrompt(f: DriveFolder) {
    const name = window.prompt("Nuevo nombre de la carpeta", f.name);
    if (!name?.trim()) return;
    await fetch(`/api/drive/folders/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    refresh();
  }

  async function deleteFolderConfirm(f: DriveFolder) {
    if (!window.confirm(`¿Eliminar la carpeta "${f.name}" y TODO su contenido (subcarpetas y archivos)? No se puede deshacer.`)) return;
    await fetch(`/api/drive/folders/${f.id}`, { method: "DELETE" });
    refresh();
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (folderId) fd.append("folderId", String(folderId));
      const res = await fetch("/api/drive/files", { method: "POST", body: fd });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Error al subir el archivo");
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">🗄️ Drive</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Tus audios y videos grabados, organizados por carpetas y vinculados a cada guion.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1 text-sm">
        <button
          onClick={() => setFolderId(null)}
          className={`rounded px-2 py-1 ${folderId === null ? "font-medium text-white" : "text-zinc-400 hover:text-zinc-200"}`}
        >
          🗄️ Mi Drive
        </button>
        {breadcrumb.map((f) => (
          <span key={f.id} className="flex items-center gap-1">
            <span className="text-zinc-600">/</span>
            <button
              onClick={() => setFolderId(f.id)}
              className={`rounded px-2 py-1 ${f.id === folderId ? "font-medium text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              {f.name}
            </button>
          </span>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowNewFolder((v) => !v)}
          className="rounded border border-edge bg-panel px-3 py-1.5 text-sm text-zinc-200 hover:border-brand"
        >
          📁+ Nueva carpeta
        </button>
        <label className="cursor-pointer rounded bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90">
          {uploading ? "Subiendo…" : "⬆️ Subir audio/video"}
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,video/*"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      {showNewFolder && (
        <div className="mb-4 flex items-center gap-2">
          <input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Nombre de la carpeta"
            onKeyDown={(e) => e.key === "Enter" && createFolder()}
            autoFocus
            className="rounded border border-edge bg-panel px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-brand"
          />
          <button onClick={createFolder} className="rounded bg-brand px-3 py-1.5 text-sm font-semibold text-white">
            Crear
          </button>
          <button onClick={() => setShowNewFolder(false)} className="text-sm text-zinc-500 hover:text-zinc-300">
            cancelar
          </button>
        </div>
      )}

      {folders.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {folders.map((f) => (
            <div key={f.id} className="group relative rounded-lg border border-edge bg-panel p-3">
              <button onClick={() => setFolderId(f.id)} className="flex w-full flex-col items-center gap-1 text-center">
                <span className="text-3xl">📁</span>
                <span className="w-full truncate text-sm text-zinc-200">{f.name}</span>
              </button>
              <div className="mt-1 hidden justify-center gap-2 text-xs group-hover:flex">
                <button onClick={() => renameFolderPrompt(f)} className="text-zinc-500 hover:text-zinc-300">renombrar</button>
                <button onClick={() => deleteFolderConfirm(f)} className="text-red-400 hover:underline">eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {files.length === 0 && folders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-edge p-10 text-center text-zinc-500">
          <p className="mb-2 text-2xl">🗄️</p>
          <p className="text-sm">Esta carpeta está vacía.</p>
          <p className="mt-1 text-xs text-zinc-600">Sube un audio o video, o crea una subcarpeta.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((f) => (
            <FileRow key={f.id} file={f} onChange={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}
