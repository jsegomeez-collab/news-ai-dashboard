"use client";
import { useEffect, useState } from "react";
import { usePoll, timeAgo } from "@/components/usePoll";
import type { CompetitorAccount, CompetitorScriptItem } from "@/lib/competitor";
import { PLATFORM_ICON, SCRIPT_STATUS_LABEL, fmt } from "@/lib/competitorUi";
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

function ScriptDoc({ s }: { s: CompetitorScriptItem }) {
  const [status, setStatus] = useState(s.status);
  const [copied, setCopied] = useState(false);

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

  const scriptText = buildScriptText(s);

  return (
    <article className="rounded-xl border border-edge/70 bg-panel p-6">
      {/* meta: fuente del video, discreta */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
        <span>{PLATFORM_ICON[s.account_platform]} @{s.account_handle}</span>
        <a href={s.video_url} target="_blank" rel="noreferrer" className="line-clamp-1 max-w-xs hover:text-brand">
          {s.video_title ?? s.video_url}
        </a>
        <span className="ml-auto flex items-center gap-3">
          {s.views !== null && <span>👁 {fmt(s.views)}</span>}
          {s.comments !== null && <span>💬 {fmt(s.comments)}</span>}
          {s.viral_score !== null && <span>🔥 {s.viral_score}/100</span>}
        </span>
      </div>

      {/* título del documento */}
      <div className="mb-3 flex items-center justify-between gap-3">
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

      {/* el guion: UN solo bloque de texto, sin cajas de colores separadas */}
      <div className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-200">{scriptText}</div>

      {s.adaptation_notes && (
        <details className="mt-4 text-xs text-zinc-600">
          <summary className="cursor-pointer select-none hover:text-zinc-400">nota de adaptación</summary>
          <p className="mt-1 italic text-zinc-500">{s.adaptation_notes}</p>
        </details>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-edge/50 pt-3">
        <span className="text-xs text-zinc-600">{timeAgo(s.created_at)}</span>
        <button
          onClick={copy}
          className="rounded border border-edge px-2.5 py-1 text-xs text-zinc-400 hover:border-brand hover:text-brand"
        >
          {copied ? "✓ Copiado" : "📋 Copiar guion"}
        </button>
      </div>
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
