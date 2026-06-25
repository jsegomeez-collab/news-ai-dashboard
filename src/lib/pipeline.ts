import { db } from "./db";
import { hasApiKey } from "./env";
import { pollAllSources } from "./sources";
import { classifyPending, pollClassifyBatches } from "./classify";
import { generateForArticle } from "./generate";
import { critiqueScript } from "./critique";
import { budgetState } from "./budget";
import { getAutoGenerate } from "./settings";

// Procesa la cola de generación respetando el tope diario y el modo automático.
export async function processGenQueue(): Promise<{ generated: number; skipped: string | null }> {
  if (!getAutoGenerate()) {
    return { generated: 0, skipped: "Generación automática desactivada (modo manual)" };
  }
  const queued = db
    .prepare(`SELECT article_id FROM gen_queue WHERE done = 0 ORDER BY enqueued_at ASC`)
    .all() as { article_id: number }[];

  let generated = 0;
  for (const { article_id } of queued) {
    const budget = budgetState();
    if (!budget.canGenerate) {
      return { generated, skipped: budget.reason };
    }
    const scriptIds = await generateForArticle(article_id);
    for (const sid of scriptIds) {
      await critiqueScript(sid);
      generated++;
    }
    db.prepare(`UPDATE gen_queue SET done = 1 WHERE article_id = ?`).run(article_id);
  }
  return { generated, skipped: null };
}

// Generación MANUAL bajo demanda (botón "Guionizar"). Ignora el modo automático
// pero respeta el tope de gasto diario. Marca el artículo como hecho en la cola.
export async function generateNow(
  articleId: number
): Promise<{ ok: boolean; generated: number; error?: string }> {
  const budget = budgetState();
  if (!budget.canGenerate) return { ok: false, generated: 0, error: budget.reason ?? "Tope diario alcanzado" };
  try {
    const scriptIds = await generateForArticle(articleId);
    for (const sid of scriptIds) await critiqueScript(sid);
    db.prepare(
      `INSERT INTO gen_queue(article_id, enqueued_at, done) VALUES(?, ?, 1)
       ON CONFLICT(article_id) DO UPDATE SET done = 1`
    ).run(articleId, new Date().toISOString());
    return { ok: true, generated: scriptIds.length };
  } catch (e) {
    return { ok: false, generated: 0, error: (e as Error).message };
  }
}

export type CycleSummary = {
  ok: boolean;
  error?: string;
  fetched: number;
  inserted: number;
  classify: { mode: string; count: number };
  batchesProcessed: number;
  generated: number;
  skipped: string | null;
};

// Un ciclo completo: traer → clasificar → recoger batches → generar guiones.
export async function runCycle(): Promise<CycleSummary> {
  const base: CycleSummary = {
    ok: true,
    fetched: 0,
    inserted: 0,
    classify: { mode: "none", count: 0 },
    batchesProcessed: 0,
    generated: 0,
    skipped: null,
  };

  try {
    const poll = await pollAllSources();
    base.fetched = poll.fetched;
    base.inserted = poll.inserted;

    if (!hasApiKey()) {
      return {
        ...base,
        ok: false,
        error: "Sin ANTHROPIC_API_KEY: se traen noticias pero no se clasifican ni generan guiones.",
      };
    }

    // Primero recoge resultados de batches anteriores (pueden llenar la cola).
    base.batchesProcessed = await pollClassifyBatches();
    base.classify = await classifyPending();
    const gen = await processGenQueue();
    base.generated = gen.generated;
    base.skipped = gen.skipped;

    return base;
  } catch (e) {
    return { ...base, ok: false, error: (e as Error).message };
  }
}
