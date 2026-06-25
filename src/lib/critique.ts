import { db } from "./db";
import { client, recordUsage, firstText, parseJsonFromText } from "./anthropic";
import { buildBrain } from "./brand";
import { getGenModel } from "./settings";

type ScriptRow = {
  id: number;
  format: string;
  title: string | null;
  hook: string | null;
  body: string | null;
  cta: string | null;
};

const CRIT_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "number", description: "Nota global 0-10, MUY crítica y honesta (decimales ok)." },
    tone_match: { type: "number", description: "0-10: cuánto suena a la TONALIDAD del creador." },
    strengths: { type: "string", description: "Qué funciona (breve)." },
    weaknesses: { type: "string", description: "Qué falla, sin piedad (breve)." },
    improvements: { type: "string", description: "Mejoras concretas y accionables para que sea un 10." },
  },
  required: ["score", "tone_match", "strengths", "weaknesses", "improvements"],
  additionalProperties: false,
} as const;

type CritOut = {
  score: number;
  tone_match: number;
  strengths: string;
  weaknesses: string;
  improvements: string;
};

const SYSTEM =
  "Eres un crítico de contenido implacable, honesto y exigente para una marca de IA aplicada a negocios. " +
  "Puntúas guiones del 0 al 10 SIN inflar la nota: un 10 es excepcional y raro. Evalúas gancho, claridad, ritmo, " +
  "valor para el espectador, fuerza del CTA y, sobre todo, si suena a la TONALIDAD del creador. Devuelve SOLO JSON válido.";

export async function critiqueScript(scriptId: number): Promise<CritOut | null> {
  const s = db
    .prepare(`SELECT id, format, title, hook, body, cta FROM scripts WHERE id = ?`)
    .get(scriptId) as ScriptRow | undefined;
  if (!s) return null;

  const brain = await buildBrain();
  const model = getGenModel();
  const system = [
    { type: "text" as const, text: SYSTEM },
    {
      type: "text" as const,
      text: brain.tonalidad
        ? `--- TONALIDAD DEL CREADOR (referencia para tone_match) ---\n${brain.tonalidad}`
        : "(No hay ejemplos de tonalidad cargados: evalúa tone_match con criterio general.)",
      cache_control: { type: "ephemeral" as const },
    },
  ];

  const userPrompt =
    `Evalúa este guion (${s.format}). Sé duro y específico.\n\n` +
    `TÍTULO: ${s.title ?? ""}\nGANCHO: ${s.hook ?? ""}\nCUERPO: ${s.body ?? ""}\nCTA: ${s.cta ?? ""}`;

  try {
    const msg = await client().messages.create({
      model,
      max_tokens: 1200,
      system,
      output_config: { format: { type: "json_schema", schema: CRIT_SCHEMA } },
      messages: [{ role: "user", content: userPrompt }],
    } as never);
    recordUsage(model, (msg as never as { usage: never }).usage);

    const out = parseJsonFromText<CritOut>(firstText(msg as never));
    if (!out) return null;

    const clamp = (n: number) => Math.max(0, Math.min(10, n));
    db.prepare(
      `INSERT INTO critiques(script_id, score, tone_match, strengths, weaknesses, improvements, model, created_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(script_id) DO UPDATE SET
         score=excluded.score, tone_match=excluded.tone_match, strengths=excluded.strengths,
         weaknesses=excluded.weaknesses, improvements=excluded.improvements,
         model=excluded.model, created_at=excluded.created_at`
    ).run(
      s.id,
      clamp(out.score),
      clamp(out.tone_match),
      out.strengths,
      out.weaknesses,
      out.improvements,
      model,
      new Date().toISOString()
    );
    return out;
  } catch (e) {
    console.warn(`[critique] error script ${scriptId}:`, (e as Error).message);
    return null;
  }
}
