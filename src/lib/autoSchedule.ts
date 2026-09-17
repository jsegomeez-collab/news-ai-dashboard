import { db } from "./db";
import { readUserSettings } from "./settings";

export type ScheduledSlot = { date: string; time: string }; // date: YYYY-MM-DD, time: HH:mm (UTC)

const MIN_GAP_MIN = 60;
const MAX_GAP_MIN = 180;

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function fmtTime(d: Date): string {
  return d.toISOString().slice(11, 16);
}

// Punto de partida para el próximo hueco: la última publicación programada
// del usuario (combinando su fecha+hora; los items manuales sin hora cuentan
// como mediodía), o AHORA si esa última publicación ya quedó en el pasado —
// nunca se encadena a partir de un hueco viejo.
function lastScheduledSlot(userId: number): Date {
  const row = db
    .prepare(
      `SELECT scheduled_date, scheduled_time FROM content_items
       WHERE user_id = ?
       ORDER BY scheduled_date DESC, COALESCE(scheduled_time, '12:00') DESC
       LIMIT 1`
    )
    .get(userId) as { scheduled_date: string; scheduled_time: string | null } | undefined;

  if (!row) return new Date();
  const candidate = new Date(`${row.scheduled_date}T${row.scheduled_time ?? "12:00"}:00.000Z`);
  const now = new Date();
  return candidate > now ? candidate : now;
}

// Calcula el siguiente hueco: último hueco (o ahora) + 1-3h aleatorias,
// encajado en la ventana horaria (UTC) de Ajustes. Si cae antes de que abra
// la ventana ese día, salta al inicio de esa misma ventana; si cae después de
// que cierre, salta al inicio de la ventana del día SIGUIENTE.
export function nextAutoSlot(userId: number): ScheduledSlot {
  const settings = readUserSettings(userId);
  const startHour = settings.postingWindowStartHour;
  const endHour = settings.postingWindowEndHour;

  const base = lastScheduledSlot(userId);
  const gapMin = MIN_GAP_MIN + Math.random() * (MAX_GAP_MIN - MIN_GAP_MIN);
  const candidate = new Date(base.getTime() + Math.round(gapMin) * 60_000);

  const hourFrac = candidate.getUTCHours() + candidate.getUTCMinutes() / 60;
  if (hourFrac < startHour) {
    candidate.setUTCHours(startHour, 0, 0, 0);
  } else if (hourFrac >= endHour) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
    candidate.setUTCHours(startHour, 0, 0, 0);
  }

  return { date: fmtDate(candidate), time: fmtTime(candidate) };
}
