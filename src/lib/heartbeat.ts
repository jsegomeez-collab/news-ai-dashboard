import { db } from "./db";

// Latido del worker de fondo: se escribe al final de CADA ciclo (éxito o
// error) para que la web pueda detectar si el worker se ha parado, aunque
// ella misma siga respondiendo con normalidad.
export type Heartbeat = {
  lastRunAt: string;
  lastOk: boolean;
  lastError: string | null;
  fetched: number;
  inserted: number;
  classified: number;
  generated: number;
};

// Nunca lanza: registrar el latido no debe poder tumbar el ciclo que lo llama.
export function recordHeartbeat(h: {
  ok: boolean;
  error?: string | null;
  fetched: number;
  inserted: number;
  classified: number;
  generated: number;
}): void {
  try {
    db.prepare(
      `INSERT INTO worker_heartbeat(id, last_run_at, last_ok, last_error, fetched, inserted, classified, generated)
       VALUES(1, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         last_run_at=excluded.last_run_at, last_ok=excluded.last_ok, last_error=excluded.last_error,
         fetched=excluded.fetched, inserted=excluded.inserted, classified=excluded.classified, generated=excluded.generated`
    ).run(
      new Date().toISOString(),
      h.ok ? 1 : 0,
      h.error ?? null,
      h.fetched,
      h.inserted,
      h.classified,
      h.generated
    );
  } catch (e) {
    console.warn("[heartbeat] no se pudo registrar:", (e as Error).message);
  }
}

export function readHeartbeat(): Heartbeat | null {
  const row = db
    .prepare(
      `SELECT last_run_at, last_ok, last_error, fetched, inserted, classified, generated
       FROM worker_heartbeat WHERE id = 1`
    )
    .get() as
    | {
        last_run_at: string;
        last_ok: number;
        last_error: string | null;
        fetched: number;
        inserted: number;
        classified: number;
        generated: number;
      }
    | undefined;
  if (!row) return null;
  return {
    lastRunAt: row.last_run_at,
    lastOk: !!row.last_ok,
    lastError: row.last_error,
    fetched: row.fetched,
    inserted: row.inserted,
    classified: row.classified,
    generated: row.generated,
  };
}
