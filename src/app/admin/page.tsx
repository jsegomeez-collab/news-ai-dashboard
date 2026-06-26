"use client";
import { usePoll } from "@/components/usePoll";

type AdminUser = {
  id: number;
  email: string;
  name: string | null;
  created_at: string;
  scripts: number;
  classified: number;
  cost_total: number;
  cost_today: number;
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

export default function AdminPage() {
  const { data } = usePoll<Overview>("/api/admin/overview", 20000);

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
              <th className="p-3 text-right">Gasto total</th>
              <th className="p-3">Alta</th>
            </tr>
          </thead>
          <tbody>
            {data.users!.map((u) => (
              <tr key={u.id} className="border-t border-edge/60">
                <td className="p-3">
                  <div className="text-zinc-200">{u.name || "—"}</div>
                  <div className="text-xs text-zinc-500">{u.email}</div>
                </td>
                <td className="p-3">
                  {u.has_key ? (
                    <span className="text-emerald-400">✓</span>
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                </td>
                <td className="p-3 text-right text-zinc-300">{u.classified}</td>
                <td className="p-3 text-right text-zinc-300">{u.scripts}</td>
                <td className="p-3 text-right text-zinc-300">${(u.cost_today || 0).toFixed(3)}</td>
                <td className="p-3 text-right text-zinc-300">${(u.cost_total || 0).toFixed(2)}</td>
                <td className="p-3 text-xs text-zinc-500">{u.created_at.slice(0, 10)}</td>
              </tr>
            ))}
            {data.users!.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-sm text-zinc-500">
                  Aún no hay usuarios registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-500">
        Eres admin porque tu email está en <code>ADMIN_EMAILS</code>. El gasto es estimado (según tokens y precios).
      </p>
    </div>
  );
}
