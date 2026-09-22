import { db } from "./db";

// Latido del worker de fondo: se escribe al final de CADA ciclo (éxito o
// error) para que la web pueda detectar si el worker se ha parado, aunque
// ella misma siga respondiendo con normalidad. Incluye por separado la salud
// del pipeline de competencia: éste puede fallar entero (Apify caído, yt-dlp
// roto...) sin que el resto del ciclo (noticias/clasificación/guiones) se
// entere, así que un solo `ok` global no basta para detectarlo.
export type Heartbeat = {
  lastRunAt: string;
  lastOk: boolean;
  lastError: string | null;
  fetched: number;
  inserted: number;
  classified: number;
  generated: number;
  competitorOk: boolean;
  competitorChecked: number;
  competitorInserted: number;
  transcribedProcessed: number;
  transcribedErrors: number;
};

export function recordHeartbeat(h: {
  ok: boolean;
  error?: string | null;
  fetched: number;
  inserted: number;
  classified: number;
  generated: number;
  competitorOk: boolean;
  competitorChecked: number;
  competitorInserted: number;
  transcribedProcessed: number;
  transcribedErrors: number;
}): void {
  try {
    db.prepare(
      `INSERT INTO worker_heartbeat(
         id, last_run_at, last_ok, last_error, fetched, inserted, classified, generated,
         competitor_ok, competitor_checked, competitor_inserted, transcribed_processed, transcribed_errors
       )
       VALUES(1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         last_run_at=excluded.last_run_at, last_ok=excluded.last_ok, last_error=excluded.last_error,
         fetched=excluded.fetched, inserted=excluded.inserted, classified=excluded.classified, generated=excluded.generated,
         competitor_ok=excluded.competitor_ok, competitor_checked=excluded.competitor_checked,
         competitor_inserted=excluded.competitor_inserted, transcribed_processed=excluded.transcribed_processed,
         transcribed_errors=excluded.transcribed_errors`
    ).run(
      new Date().toISOString(),
      h.ok ? 1 : 0,
      h.error ?? null,
      h.fetched,
      h.inserted,
      h.classified,
      h.generated,
      h.competitorOk ? 1 : 0,
      h.competitorChecked,
      h.competitorInserted,
      h.transcribedProcessed,
      h.transcribedErrors
    );
  } catch (e) {
    console.warn("[heartbeat] no se pudo registrar:", (e as Error).message);
  }
}

export function readHeartbeat(): Heartbeat | null {
  const row = db
    .prepare(
      `SELECT last_run_at, last_ok, last_error, fetched, inserted, classified, generated,
              competitor_ok, competitor_checked, competitor_inserted, transcribed_processed, transcribed_errors
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
        competitor_ok: number;
        competitor_checked: number;
        competitor_inserted: number;
        transcribed_processed: number;
        transcribed_errors: number;
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
    competitorOk: !!row.competitor_ok,
    competitorChecked: row.competitor_checked,
    competitorInserted: row.competitor_inserted,
    transcribedProcessed: row.transcribed_processed,
    transcribedErrors: row.transcribed_errors,
  };
}
