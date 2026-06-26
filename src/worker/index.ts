import cron from "node-cron";
import { env } from "../lib/env";
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
      `usuarios activos: ${r.users} · clasificadas: ${r.classified} · guiones: ${r.generated}`
  );
}

async function main(): Promise<void> {
  console.log("=== Worker AI Actualidad (multiusuario) ===");
  console.log(`Cron: ${env.pollCron} · las noticias se traen siempre; cada usuario clasifica/genera con su clave.`);

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
