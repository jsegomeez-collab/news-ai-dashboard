import { createReadStream } from "node:fs";
import type { Caption } from "@remotion/captions";
import { openaiClient } from "./whisper";

// Transcribe con timestamp por PALABRA (Whisper "verbose_json" +
// timestamp_granularities: ["word"]), a diferencia de whisper.ts que pide
// texto plano — aquí hace falta el timing exacto para sincronizar los
// subtítulos incrustados por Remotion con el audio del vídeo de HeyGen.
export async function transcribeWithWordTimestamps(apiKey: string, filePath: string): Promise<Caption[]> {
  const res = await openaiClient(apiKey).audio.transcriptions.create({
    file: createReadStream(filePath) as never,
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["word"],
  } as never);

  const words = (res as unknown as { words?: { word: string; start: number; end: number }[] }).words ?? [];
  return words.map((w) => ({
    text: w.word,
    startMs: Math.round(w.start * 1000),
    endMs: Math.round(w.end * 1000),
    timestampMs: null,
    confidence: null,
  }));
}
