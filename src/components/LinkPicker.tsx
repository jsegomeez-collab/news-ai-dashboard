"use client";
import { useEffect, useState } from "react";
import { Newspaper, Radar } from "lucide-react";

export type LinkTargetLite = { type: "script" | "competitor_script"; id: number; title: string; format: string };

// Buscador de guiones (propios o adaptados de competencia) para vincular a
// un archivo de Drive o a una publicación del calendario. Comparte el mismo
// endpoint de búsqueda (/api/drive/search) desde ambos sitios.
export function LinkPicker({
  current,
  onLink,
  onUnlink,
  placeholder = "Buscar un guion para vincular…",
}: {
  current: { type: string | null; title: string | null } | null;
  onLink: (target: LinkTargetLite) => void | Promise<void>;
  onUnlink: () => void | Promise<void>;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LinkTargetLite[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/drive/search?q=${encodeURIComponent(query)}`);
      const json = (await res.json()) as { results?: LinkTargetLite[] };
      setResults(json.results ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [query, open]);

  async function link(target: LinkTargetLite) {
    await onLink(target);
    setOpen(false);
    setQuery("");
  }

  if (current?.type && !open) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="flex items-center gap-1.5 rounded bg-brand2/15 px-2 py-0.5 text-brand2">
          {current.type === "script" ? <Newspaper size={12} /> : <Radar size={12} />} {current.title ?? "guion"}
        </span>
        <button onClick={() => setOpen(true)} className="text-zinc-500 hover:underline">cambiar</button>
        <button onClick={onUnlink} className="text-red-400 hover:underline">quitar</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
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
                className="flex w-full items-center gap-1.5 truncate px-2 py-1.5 text-left text-xs text-zinc-300 hover:bg-panel2"
              >
                {r.type === "script" ? <Newspaper size={12} /> : <Radar size={12} />} {r.title}
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
