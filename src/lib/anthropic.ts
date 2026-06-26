import Anthropic from "@anthropic-ai/sdk";
import { PRICING } from "./env";
import { db } from "./db";

// Un cliente por clave (cada usuario trae la suya).
const _clients = new Map<string, Anthropic>();
export function client(apiKey: string): Anthropic {
  if (!apiKey?.startsWith("sk-ant-")) {
    throw new Error("Falta tu clave de Anthropic (debe empezar por 'sk-ant-'). Ponla en Ajustes.");
  }
  let c = _clients.get(apiKey);
  if (!c) {
    c = new Anthropic({ apiKey });
    _clients.set(apiKey, c);
  }
  return c;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

// Registra coste estimado en usage_log POR USUARIO. Las lecturas de caché
// cuentan ~0.1x y las escrituras ~1.25x sobre el precio de input.
export function recordUsage(userId: number, model: string, usage: Usage, scripts = 0): void {
  const price = PRICING[model] ?? { in: 3, out: 15 };
  const inTok = usage.input_tokens ?? 0;
  const outTok = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;

  const cost =
    (inTok * price.in +
      outTok * price.out +
      cacheRead * price.in * 0.1 +
      cacheWrite * price.in * 1.25) /
    1_000_000;

  db.prepare(
    `INSERT INTO usage_log(user_id, day, calls, input_tokens, output_tokens, cost_usd, scripts_count)
     VALUES(?, ?, 1, ?, ?, ?, ?)
     ON CONFLICT(user_id, day) DO UPDATE SET
       calls = calls + 1,
       input_tokens = input_tokens + excluded.input_tokens,
       output_tokens = output_tokens + excluded.output_tokens,
       cost_usd = cost_usd + excluded.cost_usd,
       scripts_count = scripts_count + excluded.scripts_count`
  ).run(userId, today(), inTok + cacheRead + cacheWrite, outTok, cost, scripts);
}

// Extrae el primer bloque de texto de una respuesta de Messages.
export function firstText(msg: Anthropic.Message): string {
  for (const block of msg.content) {
    if (block.type === "text") return block.text;
  }
  return "";
}

// Extrae y parsea el JSON del primer bloque de texto (para structured outputs
// o respuestas que devuelven JSON). Tolera ```json ... ``` envolviendo.
export function parseJsonFromText<T>(text: string): T | null {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const startArr = t.indexOf("[");
  const s =
    startArr !== -1 && (start === -1 || startArr < start) ? startArr : start;
  if (s > 0) t = t.slice(s);
  try {
    return JSON.parse(t) as T;
  } catch {
    return null;
  }
}
