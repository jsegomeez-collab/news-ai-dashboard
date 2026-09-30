"use client";
import { PageHeader } from "@/components/PageHeader";
import { useEffect, useState } from "react";
import { BRAND_KINDS, BRAND_LABEL, BRAND_HINT, type BrandKind } from "@/lib/status";
import { Plus, Lightbulb } from "lucide-react";

type SwipeItem = {
  id: number;
  title: string;
  platform: string | null;
  author: string | null;
  content: string;
  why: string | null;
  created_at: string;
};

function DocCard({
  kind,
  initial,
  onSaved,
}: {
  kind: BrandKind;
  initial: string;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const dirty = value !== initial;

  async function save() {
    setSaving(true);
    try {
      await fetch("/api/brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, content: value }),
      });
      setSavedAt(Date.now());
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-edge bg-panel p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="font-semibold text-white">{BRAND_LABEL[kind]}</h3>
        {dirty ? (
          <span className="text-xs text-amber-400">sin guardar</span>
        ) : savedAt ? (
          <span className="text-xs text-emerald-400">guardado ✓</span>
        ) : null}
      </div>
      <p className="mb-2 text-xs text-zinc-500">{BRAND_HINT[kind]}</p>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={6}
        placeholder="Escribe aquí…"
        className="w-full resize-y rounded border border-edge bg-ink p-2 text-sm text-zinc-200 outline-none focus:border-brand"
      />
      <div className="mt-2 flex justify-end">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="rounded bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}

function SwipeForm({ onAdded }: { onAdded: () => void }) {
  const [f, setF] = useState({ title: "", platform: "", author: "", content: "", why: "" });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function add() {
    if (!f.title.trim() || !f.content.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/swipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      setF({ title: "", platform: "", author: "", content: "", why: "" });
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-edge bg-panel p-4">
      <h3 className="mb-1 flex items-center gap-1.5 font-semibold text-white"><Plus size={15} /> Añadir guion de la competencia que funcionó</h3>
      <p className="mb-3 text-xs text-zinc-500">
        Pega guiones/vídeos que petaron. Claude aprende el patrón de lo que funciona para replicarlo (no copiar literal).
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          value={f.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Título *"
          className="rounded border border-edge bg-ink p-2 text-sm text-zinc-200 outline-none focus:border-brand"
        />
        <input
          value={f.platform}
          onChange={(e) => set("platform", e.target.value)}
          placeholder="Plataforma (IG, YT, TikTok…)"
          className="rounded border border-edge bg-ink p-2 text-sm text-zinc-200 outline-none focus:border-brand"
        />
        <input
          value={f.author}
          onChange={(e) => set("author", e.target.value)}
          placeholder="Autor / cuenta"
          className="rounded border border-edge bg-ink p-2 text-sm text-zinc-200 outline-none focus:border-brand"
        />
      </div>
      <textarea
        value={f.content}
        onChange={(e) => set("content", e.target.value)}
        rows={4}
        placeholder="Guion / transcripción del vídeo *"
        className="mt-2 w-full resize-y rounded border border-edge bg-ink p-2 text-sm text-zinc-200 outline-none focus:border-brand"
      />
      <input
        value={f.why}
        onChange={(e) => set("why", e.target.value)}
        placeholder="¿Por qué crees que funcionó? (opcional)"
        className="mt-2 w-full rounded border border-edge bg-ink p-2 text-sm text-zinc-200 outline-none focus:border-brand"
      />
      <div className="mt-2 flex justify-end">
        <button
          onClick={add}
          disabled={saving || !f.title.trim() || !f.content.trim()}
          className="rounded bg-brand2 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {saving ? "Añadiendo…" : "Añadir al swipe file"}
        </button>
      </div>
    </div>
  );
}

export default function MarcaPage() {
  const [docs, setDocs] = useState<Record<string, string> | null>(null);
  const [swipe, setSwipe] = useState<SwipeItem[]>([]);

  async function load() {
    const res = await fetch("/api/brand", { cache: "no-store" });
    const json = (await res.json()) as { docs: Record<string, string>; swipe: SwipeItem[] };
    setDocs(json.docs);
    setSwipe(json.swipe);
  }
  useEffect(() => {
    load();
  }, []);

  async function delSwipe(id: number) {
    await fetch(`/api/swipe?id=${id}`, { method: "DELETE" });
    load();
  }

  if (!docs) return <p className="text-sm text-zinc-500">Cargando…</p>;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Marca"
        subtitle="El cerebro con el que se escriben tus guiones: tu negocio, tu cliente, tu oferta y los guiones de referencia que ya funcionaron."
      />
      <section>
        <h2 className="mb-1 text-lg font-bold text-white">Bases de negocio</h2>
        <p className="mb-4 text-sm text-zinc-400">
          Esto es el cerebro con el que se escriben tus guiones. Cuanto mejor lo rellenes, más “tuyos” y más enfocados a venta saldrán.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {BRAND_KINDS.map((k) => (
            <DocCard key={k} kind={k} initial={docs[k] ?? ""} onSaved={load} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-lg font-bold text-white">Swipe file de la competencia</h2>
        <p className="mb-4 text-sm text-zinc-400">
          Guiones que ya funcionaron (tuyos o de otros). El motor los usa como referencia de “qué funciona”.
        </p>
        <div className="grid gap-3">
          <SwipeForm onAdded={load} />
          {swipe.map((s) => (
            <div key={s.id} className="rounded-lg border border-edge bg-panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-medium text-white">{s.title}</h4>
                  <div className="text-xs text-zinc-500">
                    {[s.platform, s.author].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <button onClick={() => delSwipe(s.id)} className="text-xs text-red-400 hover:underline">
                  eliminar
                </button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">{s.content}</p>
              {s.why && <p className="mt-2 flex items-center gap-1.5 text-sm text-brand2"><Lightbulb size={13} /> {s.why}</p>}
            </div>
          ))}
          {swipe.length === 0 && (
            <p className="text-sm text-zinc-500">Aún no has añadido ejemplos.</p>
          )}
        </div>
      </section>
    </div>
  );
}
