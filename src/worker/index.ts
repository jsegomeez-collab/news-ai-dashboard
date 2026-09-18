import cron from "node-cron";
import { env } from "../lib/env";
import { runCycle } from "../lib/pipeline";

const ONCE = process.argv.includes("--once");
const DEFAULT_CRON = "0 */2 * * *";

function ts(): string {
  return new Date().toLocaleTimeString("es-ES");
}

// Si POLL_CRON viniera mal formado, cron.schedule() lanzaría dentro de main(),
// y el bucle de reintento de start() (más abajo) repetiría el CICLO COMPLETO
// cada 30s para siempre (noticias + competencia + Whisper + Claude, por cada
// usuario) — y como el ciclo en sí tiene éxito, el heartbeat lo reportaría
// como "sano" todo el tiempo. Por eso se valida aquí, antes de intentar
// programarlo, y se usa un valor por defecto seguro en vez de reintentar.
function resolvePollCron(): string {
  if (cron.validate(env.pollCron)) return env.pollCron;
  console.error(
    `[${ts()}] ✖ POLL_CRON inválido ("${env.pollCron}"), usando el valor por defecto "${DEFAULT_CRON}"`
  );
  return DEFAULT_CRON;
}
const POLL_CRON = resolvePollCron();

function describeCompetitor(comp: Awaited<ReturnType<typeof runCycle>>["competitor"]): string {
  if (!comp) return "";
  if (comp.unavailable.length > 0) {
    return ` · espías: +${comp.inserted} videos (faltan: ${comp.unavailable.join(", ")})`;
  }
  return ` · espías: +${comp.inserted} videos`;
}

function describeTranscription(trans: Awaited<ReturnType<typeof runCycle>>["transcribed"]): string {
  if (!trans) return "";
  if (trans.processed > 0) return ` · transcriptos: ${trans.processed}`;
  if (trans.noKey > 0) return ` · transcripción: sin clave OpenAI`;
  return "";
}

function describeHeygen(hg: Awaited<ReturnType<typeof runCycle>>["heygen"]): string {
  if (hg.completed === 0 && hg.errors === 0) return "";
  const parts = [];
  if (hg.completed > 0) parts.push(`${hg.completed} listos`);
  if (hg.errors > 0) parts.push(`${hg.errors} con error`);
  return ` · heygen: ${parts.join(", ")}`;
}

function describePublish(p: Awaited<ReturnType<typeof runCycle>>["publish"]): string {
  if (p.scheduled === 0 && p.errors === 0) return "";
  const parts = [];
  if (p.scheduled > 0) parts.push(`${p.scheduled} programados`);
  if (p.errors > 0) parts.push(`${p.errors} con error`);
  return ` · metricool: ${parts.join(", ")}`;
}

async function cycle(): Promise<void> {
  console.log(`\n[${ts()}] ▶ ciclo iniciado`);
  const r = await runCycle();
  if (!r.ok) console.warn(`[${ts()}] ⚠ ${r.error}`);

  console.log(
    `[${ts()}] ✔ noticias: ${r.inserted}/${r.fetched} · ` +
      `u${r.users} · clasif: ${r.classified} · guiones: ${r.generated}` +
      `${describeCompetitor(r.competitor)}${describeTranscription(r.transcribed)}${describeHeygen(r.heygen)}${describePublish(r.publish)}`
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
  console.log(`Cron: ${POLL_CRON} · las noticias se traen siempre; cada usuario clasifica/genera con su clave.`);

  try {
    await cycle();
  } catch (e) {
    console.error(`[${ts()}] ✖ primer ciclo falló, se reintentará en el próximo tick del cron:`, e);
  }

  if (ONCE) {
    console.log("Modo --once: terminado.");
    process.exit(0);
  }

  cron.schedule(POLL_CRON, () => {
    cycle().catch((e) => console.error(`[${ts()}] ✖ ciclo falló:`, e));
  });
  console.log(`\nWorker activo. Próximos ciclos según cron "${POLL_CRON}". Ctrl+C para salir.`);
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
