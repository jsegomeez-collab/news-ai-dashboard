import cron from "node-cron";
import { env, hasApiKey } from "../lib/env";
import { runCycle } from "../lib/pipeline";

const ONCE = process.argv.includes("--once");

function ts(): string {
  return new Date().toLocaleTimeString("es-ES");
}

async function cycle(): Promise<void> {
  console.log(`\n[${ts()}] ▶ ciclo iniciado`);
  const r = await runCycle();
  if (!r.ok) console.warn(`[${ts()}] ⚠ ${r.error}`);
  console.log(
    `[${ts()}] ✔ noticias: ${r.inserted} nuevas / ${r.fetched} vistas · ` +
      `clasificación: ${r.classify.mode} (${r.classify.count}) · ` +
      `batches: ${r.batchesProcessed} · guiones: ${r.generated}` +
      (r.skipped ? ` · ⏸ ${r.skipped}` : "")
  );
}

async function main(): Promise<void> {
  console.log("=== Worker AI Actualidad ===");
  console.log(`API key: ${hasApiKey() ? "OK" : "FALTA (solo se traerán noticias)"}`);
  console.log(`Cron: ${env.pollCron} · umbral relevancia: ${env.relevanceThreshold} · formatos: ${env.generateFormats.join(", ")}`);

  // Ejecuta un ciclo de inmediato al arrancar.
  await cycle();

  if (ONCE) {
    console.log("Modo --once: terminado.");
    process.exit(0);
  }

  cron.schedule(env.pollCron, () => {
    cycle().catch((e) => console.error("[worker] ciclo falló:", e));
  });
  console.log(`\nWorker activo. Próximos ciclos según cron "${env.pollCron}". Ctrl+C para salir.`);
}

main().catch((e) => {
  console.error("[worker] error fatal:", e);
  process.exit(1);
});
