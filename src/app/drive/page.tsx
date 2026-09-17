"use client";
import { useRef, useState } from "react";
import { usePoll, timeAgo } from "@/components/usePoll";
import type { DriveFolder, DriveFile } from "@/lib/drive";
import { DRIVE_STATUSES, DRIVE_STATUS_LABEL, driveKindIcon, fmtBytes } from "@/lib/driveUi";
import { StatusPill } from "@/components/StatusPill";
import { LinkPicker, type LinkTargetLite } from "@/components/LinkPicker";

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

  async function link(target: LinkTargetLite) {
    await fetch(`/api/drive/files/${file.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkedType: target.type, linkedId: target.id }),
    });
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

  async function remove() {
    if (!window.confirm(`¿Eliminar "${file.original_name}"? No se puede deshacer.`)) return;
    await fetch(`/api/drive/files/${file.id}`, { method: "DELETE" });
    onChange();
  }

  const url = `/api/drive/files/${file.id}/content`;

  return (
    <div className={`rounded-xl border bg-panel transition ${expanded ? "border-brand/40" : "border-edge hover:border-edge"}`}>
      <button onClick={() => setExpanded((e) => !e)} className="flex w-full items-center gap-3 p-3.5 text-left">
        <span className="text-2xl">{driveKindIcon(file.kind)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{file.original_name}</p>
          <p className="text-xs text-zinc-500">
            {fmtBytes(file.size)} · {timeAgo(file.uploaded_at)}
            {file.linked_title ? ` · vinculado a "${file.linked_title}"` : ""}
          </p>
        </div>
        {file.scheduled_date && <span className="hidden shrink-0 text-xs text-zinc-500 sm:inline">📅 {file.scheduled_date}</span>}
        <StatusPill status={file.status} size="sm" />
        <span className="shrink-0 text-xs text-zinc-500">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-edge/60 p-4">
          <div className="overflow-hidden rounded-lg bg-ink">
            {file.kind === "video" ? (
              <video src={url} controls className="max-h-72 w-full" />
            ) : (
              <audio src={url} controls className="w-full p-3" />
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-zinc-500">
              Estado
              <select
                value={status}
                onChange={(e) => changeStatus(e.target.value)}
                className="mt-1 w-full rounded-lg border border-edge bg-ink px-2 py-1.5 text-sm text-zinc-200"
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
                className="mt-1 w-full rounded-lg border border-edge bg-ink px-2 py-1.5 text-sm text-zinc-200"
              />
            </label>
          </div>

          <div>
            <p className="mb-1 text-xs text-zinc-500">Vinculado a un guion</p>
            <LinkPicker
              current={{ type: file.linked_type, title: file.linked_title }}
              onLink={link}
              onUnlink={unlink}
            />
          </div>

          <div className="flex items-center justify-between border-t border-edge/40 pt-3">
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
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-white">🗄️ Drive</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Tus audios y videos grabados, organizados por carpetas y vinculados a cada guion.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1 text-sm">
        <button
          onClick={() => setFolderId(null)}
          className={`rounded-lg px-2.5 py-1 transition ${folderId === null ? "bg-panel2 font-medium text-white" : "text-zinc-400 hover:text-zinc-200"}`}
        >
          🗄️ Mi Drive
        </button>
        {breadcrumb.map((f) => (
          <span key={f.id} className="flex items-center gap-1">
            <span className="text-zinc-600">/</span>
            <button
              onClick={() => setFolderId(f.id)}
              className={`rounded-lg px-2.5 py-1 transition ${f.id === folderId ? "bg-panel2 font-medium text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              {f.name}
            </button>
          </span>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowNewFolder((v) => !v)}
          className="rounded-lg border border-edge bg-panel px-3 py-1.5 text-sm text-zinc-200 hover:border-brand"
        >
          📁+ Nueva carpeta
        </button>
        <label className="cursor-pointer rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90">
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
            className="rounded-lg border border-edge bg-panel px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-brand"
          />
          <button onClick={createFolder} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white">
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
            <div key={f.id} className="group relative rounded-xl border border-edge bg-panel p-3 transition hover:border-brand/40">
              <button onClick={() => setFolderId(f.id)} className="flex w-full flex-col items-center gap-1.5 text-center">
                <span className="text-3xl">📁</span>
                <span className="w-full truncate text-sm text-zinc-200">{f.name}</span>
              </button>
              <div className="mt-1.5 hidden justify-center gap-2 text-xs group-hover:flex">
                <button onClick={() => renameFolderPrompt(f)} className="text-zinc-500 hover:text-zinc-300">renombrar</button>
                <button onClick={() => deleteFolderConfirm(f)} className="text-red-400 hover:underline">eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {files.length === 0 && folders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-edge p-10 text-center text-zinc-500">
          <p className="mb-2 text-2xl">🗄️</p>
          <p className="text-sm">Esta carpeta está vacía.</p>
          <p className="mt-1 text-xs text-zinc-600">Sube un audio o video, o crea una subcarpeta.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {files.map((f) => (
            <FileRow key={f.id} file={f} onChange={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}
