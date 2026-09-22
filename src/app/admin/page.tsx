"use client";
import { useState } from "react";
import { usePoll, timeAgo } from "@/components/usePoll";

type AdminUser = {
  id: number;
  email: string;
  name: string | null;
  created_at: string;
  scripts: number;
  classified: number;
  cost_total: number;
  cost_today: number;
  cost_month: number;
  heygen_cost_today: number;
  heygen_cost_month: number;
  heygen_cost_total: number;
  last_activity_at: string | null;
  max_scripts_per_day: number;
  max_daily_usd: number;
  competitor_adapt_limit: number;
  heygen_daily_usd_cap: number;
  has_key: number;
};
type Overview = {
  error?: string;
  users?: AdminUser[];
  totals?: { users: number; articles: number; scripts: number; costTotal: number; costToday: number };
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-edge bg-panel p-4">
      <div className="text-xs uppercase text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

// Fila de un usuario, con su propio panel expandible para tocar los topes de
// gasto/análisis (los mismos que él vería en su Ajustes) y borrarlo entero —
// para poder frenar/limpiar una cuenta sin depender de que lo haga ella misma.
function UserRow({ u, onChanged }: { u: AdminUser; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [maxScripts, setMaxScripts] = useState(u.max_scripts_per_day);
  const [maxUsd, setMaxUsd] = useState(u.max_daily_usd);
  const [adaptLimit, setAdaptLimit] = useState(u.competitor_adapt_limit);
  const [heygenCap, setHeygenCap] = useState(u.heygen_daily_usd_cap);

  async function saveLimits() {
    setSaving(true);
    try {
      await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxScriptsPerDay: maxScripts,
          maxDailyUsd: maxUsd,
          competitorAdaptLimit: adaptLimit,
          heygenDailyUsdCap: heygenCap,
        }),
      });
      setEditing(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    if (
      !confirm(
        `¿Eliminar la cuenta de ${u.email}? Se borrarán TODOS sus guiones, competencia, vídeos de HeyGen, Drive y calendario, sin poder deshacerlo.`
      )
    )
      return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        alert(json.error ?? "No se pudo eliminar");
        return;
      }
      onChanged();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <tr className="border-t border-edge/60">
        <td className="p-3">
          <div className="text-zinc-200">{u.name || "—"}</div>
          <div className="text-xs text-zinc-500">{u.email}</div>
        </td>
        <td className="p-3">{u.has_key ? <span className="text-emerald-400">✓</span> : <span className="text-zinc-600">—</span>}</td>
        <td className="p-3 text-right text-zinc-300">{u.classified}</td>
        <td className="p-3 text-right text-zinc-300">{u.scripts}</td>
        <td className="p-3 text-right text-zinc-300">${((u.cost_today || 0) + (u.heygen_cost_today || 0)).toFixed(3)}</td>
        <td className="p-3 text-right text-zinc-300">${((u.cost_month || 0) + (u.heygen_cost_month || 0)).toFixed(2)}</td>
        <td className="p-3 text-right text-zinc-300">${((u.cost_total || 0) + (u.heygen_cost_total || 0)).toFixed(2)}</td>
        <td className="p-3 text-xs text-zinc-500">{u.last_activity_at ? timeAgo(u.last_activity_at) : "—"}</td>
        <td className="p-3 text-xs text-zinc-500">{u.created_at.slice(0, 10)}</td>
        <td className="p-3">
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setEditing((e) => !e)} className="rounded border border-edge px-2 py-0.5 text-xs text-zinc-400 hover:text-zinc-200">
              {editing ? "Cerrar" : "Límites"}
            </button>
            <button
              onClick={del}
              disabled={deleting}
              className="rounded border border-red-900/50 px-2 py-0.5 text-xs text-red-400 hover:text-red-300 disabled:opacity-40"
            >
              {deleting ? "…" : "Eliminar"}
            </button>
          </div>
        </td>
      </tr>
      {editing && (
        <tr className="border-t border-edge/40 bg-ink/40">
          <td colSpan={10} className="p-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ["Guiones/día máx.", maxScripts, setMaxScripts, 0, 500] as const,
                  ["Gasto Anthropic/día máx. ($)", maxUsd, setMaxUsd, 0, 1000] as const,
                  ["Guiones adaptados/día máx.", adaptLimit, setAdaptLimit, 0, 500] as const,
                  ["Gasto HeyGen/día máx. ($)", heygenCap, setHeygenCap, 0, 1000] as const,
                ] as [string, number, (v: number) => void, number, number][]
              ).map(([label, val, setter, min, max]) => (
                <label key={label} className="text-xs text-zinc-400">
                  {label}
                  <input
                    type="number"
                    min={min}
                    max={max}
                    value={val}
                    onChange={(e) => setter(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
                    className="mt-1 w-full rounded border border-edge bg-ink p-1.5 text-sm text-zinc-200 outline-none focus:border-brand"
                  />
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-zinc-600">0 = sin tope (donde aplique). Son los mismos límites que el usuario ve en su propio Ajustes.</p>
            <button onClick={saveLimits} disabled={saving} className="mt-2 rounded bg-brand px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "Guardando…" : "Guardar límites"}
            </button>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AdminPage() {
  const { data, refresh } = usePoll<Overview>("/api/admin/overview", 20000);

  if (!data) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (data.error) return <p className="text-sm text-red-400">{data.error}</p>;

  const t = data.totals!;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Usuarios" value={String(t.users)} />
        <Stat label="Noticias (global)" value={String(t.articles)} />
        <Stat label="Guiones totales" value={String(t.scripts)} />
        <Stat label="Gasto total" value={`$${t.costTotal.toFixed(2)}`} />
        <Stat label="Gasto hoy" value={`$${t.costToday.toFixed(2)}`} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-edge">
        <table className="w-full text-sm">
          <thead className="bg-panel text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="p-3">Usuario</th>
              <th className="p-3">Clave</th>
              <th className="p-3 text-right">Clasificadas</th>
              <th className="p-3 text-right">Guiones</th>
              <th className="p-3 text-right">Gasto hoy</th>
              <th className="p-3 text-right">Gasto mes</th>
              <th className="p-3 text-right">Gasto total</th>
              <th className="p-3">Última actividad</th>
              <th className="p-3">Alta</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {data.users!.map((u) => (
              <UserRow key={u.id} u={u} onChanged={refresh} />
            ))}
            {data.users!.length === 0 && (
              <tr>
                <td colSpan={10} className="p-4 text-center text-sm text-zinc-500">
                  Aún no hay usuarios registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-500">
        Eres admin porque tu email está en <code>ADMIN_EMAILS</code>. El gasto es estimado (según tokens/segundos y precios) e
        incluye Anthropic + HeyGen combinados en las tres columnas de gasto.
      </p>
    </div>
  );
}
