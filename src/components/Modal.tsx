"use client";
import { useEffect } from "react";
import { X } from "lucide-react";

// Popup genérico: overlay oscuro + tarjeta de cristal centrada con halo neón.
// Cierra con Escape o clicando fuera. No usa portal (no hace falta: nada en
// el árbol tiene overflow/transform que rompa un fixed) para mantenerlo simple.
export function Modal({ title, onClose, children }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-deep/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="rise w-full max-w-md rounded-card-lg border border-edge2/60 bg-panel p-6 shadow-neon-hi"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-black tracking-[-0.02em] text-white">{title}</h3>
          <button
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-edge text-zinc-400 hover:border-edge2 hover:text-white"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
