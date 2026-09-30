import { ChevronLeft, ChevronRight } from "lucide-react";

// Paginador compartido por /, /competencia y /adaptados — antes cada uno
// repetía el mismo botón "← Anterior" / "Siguiente →" en texto plano.
export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-2 flex items-center justify-center gap-3">
      <button
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="inline-flex items-center gap-1 rounded-lg border border-edge bg-panel px-3 py-1.5 text-sm text-zinc-300 disabled:opacity-40"
      >
        <ChevronLeft size={15} /> Anterior
      </button>
      <span className="text-sm text-zinc-400">
        Página {page} de {pages}
      </span>
      <button
        onClick={() => onChange(Math.min(pages, page + 1))}
        disabled={page >= pages}
        className="inline-flex items-center gap-1 rounded-lg border border-edge bg-panel px-3 py-1.5 text-sm text-zinc-300 disabled:opacity-40"
      >
        Siguiente <ChevronRight size={15} />
      </button>
    </div>
  );
}
