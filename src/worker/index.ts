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

// El worker corre como proceso hijo de "npm start" junto a la web (ver
// package.json). Si este proceso muere, la web sigue sirviendo con total
// normalidad y nada avisa de que el worker dejó de ejecutarse — así se
// descubrió que las cuentas de competencia llevaban 50 días sin revisarse.
// Por eso aquí NUNCA se hace process.exit() salvo en modo --once: cualquier
// fallo se loguea y el proceso se mantiene vivo para el siguiente ciclo.
process.on("uncaughtException", (e) => {
  console.error(`[${ts()}] ✖ excepción no capturada (el worker sigue vivo):`, e);
});
process.on("unhandledRejection", (e) => {
  console.error(`[${ts()}] ✖ promesa rechazada sin capturar (el worker sigue vivo):`, e);
});

async function main(): Promise<void> {
  console.log("=== Worker AI Actualidad (multiusuario) ===");
  console.log(`Cron: ${env.pollCron} · las noticias se traen siempre; cada usuario clasifica/genera con su clave.`);

  try {
    await cycle();
  } catch (e) {
    console.error(`[${ts()}] ✖ primer ciclo falló, se reintentará en el próximo tick del cron:`, e);
  }

  if (ONCE) {
    console.log("Modo --once: terminado.");
    process.exit(0);
  }

  cron.schedule(env.pollCron, () => {
    cycle().catch((e) => console.error(`[${ts()}] ✖ ciclo falló:`, e));
  });
  console.log(`\nWorker activo. Próximos ciclos según cron "${env.pollCron}". Ctrl+C para salir.`);
}

// Si algo impide arrancar (p.ej. la BD ocupada porque la web la está
// inicializando a la vez), reintenta en vez de morir para siempre.
function start(): void {
  main().catch((e) => {
    console.error(`[${ts()}] ✖ arranque del worker falló, reintentando en 30s:`, e);
    setTimeout(start, 30_000);
  });
}
start();
