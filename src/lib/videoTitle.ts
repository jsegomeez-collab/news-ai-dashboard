import { client, recordUsage, firstText, parseJsonFromText } from "./anthropic";
import { readUserSettings } from "./settings";

const TITLE_SCHEMA = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description:
        "Titular corto y llamativo (5-8 palabras) para fijar en la parte superior del vídeo durante todo el visionado. Como el titular de una noticia: directo, sin relleno, sin comillas.",
    },
    subtitle: {
      type: "string",
      description: "Línea de apoyo más corta debajo del título: añade contexto o intriga sin repetir el título.",
    },
  },
  required: ["title", "subtitle"],
  additionalProperties: false,
} as const;

type TitleOut = { title: string; subtitle: string };

const SYSTEM =
  "Eres un editor de vídeos virales para redes sociales. A partir de la TRANSCRIPCIÓN de un vídeo ya grabado " +
  "(no la escribes tú, solo la lees), redactas el titular que se fija arriba de la pantalla durante todo el " +
  "vídeo — el equivalente a lo que hace que alguien deje de hacer scroll. Corto, directo, sin emojis, en " +
  "español. Devuelve SOLO JSON válido.";

// A partir de la transcripción (ya hecha para los subtítulos de abajo, no se
// vuelve a llamar a Whisper) genera título+subtítulo para la cabecera fija.
// No bloqueante: si falla (sin clave, error de red, lo que sea) el vídeo se
// renderiza igualmente, solo que sin cabecera — no vale la pena perder un
// vídeo entero por esto.
export async function generateVideoTitle(userId: number, transcriptText: string): Promise<TitleOut | null> {
  const settings = readUserSettings(userId);
  if (!settings.anthropicKey.startsWith("sk-ant-")) return null;
  try {
    const msg = await client(settings.anthropicKey).messages.create({
      model: settings.genModel,
      max_tokens: 300,
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: TITLE_SCHEMA } },
      messages: [{ role: "user", content: `Transcripción del vídeo:\n\n${transcriptText.slice(0, 3000)}` }],
    } as never);
    recordUsage(userId, settings.genModel, (msg as never as { usage: never }).usage);
    return parseJsonFromText<TitleOut>(firstText(msg as never));
  } catch (e) {
    console.warn(`[heygen] título automático u${userId}:`, (e as Error).message);
    return null;
  }
}
