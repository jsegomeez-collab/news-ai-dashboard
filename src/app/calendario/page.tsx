"use client";
import { useMemo, useState } from "react";
import { usePoll } from "@/components/usePoll";
import { DRIVE_STATUS_LABEL, DRIVE_STATUS_COLOR, driveKindIcon } from "@/lib/driveUi";

// Tipo local (no se importa de @/lib/calendar a propósito: ese módulo toca la
// BD y no debe entrar en el bundle del navegador — esta forma es justo la que
// devuelve GET /api/calendar).
type CalendarItem = {
  date: string;
  source: "drive" | "script";
  id: number;
  title: string;
  status: string;
  kind: string | null;
};

const MONTH_LABEL = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const WEEKDAY_LABEL = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function DayItem({ item, onChange }: { item: CalendarItem; onChange: () => void }) {
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
    <div className="flex items-center justify-between gap-3 rounded border border-edge/60 bg-ink/40 p-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate text-zinc-200">
          {item.source === "drive" ? driveKindIcon(item.kind ?? "audio") : "📰"} {item.title}
        </p>
        <p className="text-xs text-zinc-500">
          {item.source === "drive" ? DRIVE_STATUS_LABEL[item.status] ?? item.status : "Publicado (métricas reales)"}
        </p>
      </div>
      {item.source === "drive" && (
        <input
          type="date"
          value={date}
          onChange={(e) => reschedule(e.target.value)}
          className="shrink-0 rounded border border-edge bg-panel px-2 py-1 text-xs text-zinc-200"
        />
      )}
    </div>
  );
}

export default function CalendarioPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth()); // 0-11
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const monthParam = `${year}-${pad2(monthIndex + 1)}`;
  const { data, refresh } = usePoll<{ items: CalendarItem[] }>(`/api/calendar?month=${monthParam}`, 30000);
  const items = data?.items ?? [];

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
            Lo que tienes programado en Drive y lo que ya has publicado de verdad, en un solo sitio.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => changeMonth(-1)} className="rounded border border-edge bg-panel px-3 py-1.5 text-sm text-zinc-300 hover:border-brand">←</button>
          <span className="w-36 text-center text-sm font-medium text-white">
            {MONTH_LABEL[monthIndex]} {year}
          </span>
          <button onClick={() => changeMonth(1)} className="rounded border border-edge bg-panel px-3 py-1.5 text-sm text-zinc-300 hover:border-brand">→</button>
        </div>
      </div>

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
            <button
              key={dateStr}
              onClick={() => setSelectedDate(dateStr)}
              className={`min-h-20 rounded border p-1 text-left align-top transition ${
                isSelected ? "border-brand bg-panel2" : isToday ? "border-brand/60 bg-panel" : "border-edge bg-panel hover:border-edge"
              }`}
            >
              <div className={`text-xs ${isToday ? "font-semibold text-brand" : "text-zinc-500"}`}>{Number(dateStr.slice(-2))}</div>
              <div className="mt-1 space-y-0.5">
                {dayItems.slice(0, 3).map((it) => (
                  <div
                    key={`${it.source}-${it.id}`}
                    className={`truncate rounded px-1 text-[10px] ${
                      it.source === "script" ? "bg-emerald-800/60 text-emerald-100" : (DRIVE_STATUS_COLOR[it.status] ?? "bg-zinc-700 text-zinc-300")
                    }`}
                  >
                    {it.title}
                  </div>
                ))}
                {dayItems.length > 3 && <div className="text-[10px] text-zinc-600">+{dayItems.length - 3} más</div>}
              </div>
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <div className="mt-4 rounded-lg border border-edge bg-panel p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">{selectedDate}</h3>
          {(itemsByDate[selectedDate] ?? []).length === 0 ? (
            <p className="text-sm text-zinc-500">Nada programado este día.</p>
          ) : (
            <div className="space-y-2">
              {itemsByDate[selectedDate].map((it) => (
                <DayItem key={`${it.source}-${it.id}`} item={it} onChange={refresh} />
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-zinc-600">
            Para programar un archivo nuevo, ve a 🗄️ Drive, ábrelo y ponle una fecha.
          </p>
        </div>
      )}
    </div>
  );
}
