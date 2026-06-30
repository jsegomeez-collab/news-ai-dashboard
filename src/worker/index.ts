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
  const comp = r.competitor;
  const trans = r.transcribed;
  const compStr = !comp
    ? ""
    : !comp.available
    ? " · yt-dlp: no instalado"
    : ` · espías: +${comp.inserted} videos`;
  const transStr = trans && trans.processed > 0
    ? ` · transcriptos: ${trans.processed}`
    : trans && trans.noKey > 0
    ? ` · transcripción: sin clave OpenAI`
    : "";

  console.log(
    `[${ts()}] ✔ noticias: ${r.inserted}/${r.fetched} · ` +
      `u${r.users} · clasif: ${r.classified} · guiones: ${r.generated}${compStr}${transStr}`
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
