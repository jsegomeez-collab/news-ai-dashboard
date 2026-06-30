import { createReadStream, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import OpenAI from "openai";
import { readUserSettings } from "./settings";
import { pendingVideosWithUser, setVideoStatus, saveTranscript } from "./competitor";
import { downloadAudio, ytdlpAvailable } from "./ytdlp";

// Clientes OpenAI por API key (reutilizados).
const _openaiClients = new Map<string, OpenAI>();
function openaiClient(apiKey: string): OpenAI {
  let c = _openaiClients.get(apiKey);
  if (!c) { c = new OpenAI({ apiKey }); _openaiClients.set(apiKey, c); }
  return c;
}

async function transcribeFile(apiKey: string, audioPath: string): Promise<string> {
  const res = await openaiClient(apiKey).audio.transcriptions.create({
    file: createReadStream(audioPath) as never,
    model: "whisper-1",
    response_format: "text",
  });
  return (res as unknown as string).trim();
}

export type TranscribeResult = { processed: number; errors: number; noKey: number };

// Procesa los videos pendientes de transcripción (máx. `limit` por ciclo para no bloquear el worker).
export async function transcribePendingVideos(limit = 5): Promise<TranscribeResult> {
  const hasYtdlp = await ytdlpAvailable();
  if (!hasYtdlp) return { processed: 0, errors: 0, noKey: 0 };

  const pending = pendingVideosWithUser(limit);
  let processed = 0, errors = 0, noKey = 0;

  for (const { id, video_url, user_id } of pending) {
    const settings = readUserSettings(user_id);
    if (!settings.openaiKey.startsWith("sk-")) {
      noKey++;
      continue;
    }

    const audioPath = join(tmpdir(), `comp-${id}-${Date.now()}.mp3`);
    setVideoStatus(id, "transcribing");

    try {
      // 1. Descarga solo el audio (mp3).
      await downloadAudio(video_url, audioPath);

      if (!existsSync(audioPath)) throw new Error("yt-dlp no generó el archivo de audio");

      // 2. Transcribe con Whisper.
      const text = await transcribeFile(settings.openaiKey, audioPath);
      if (!text) throw new Error("Whisper devolvió transcripción vacía");

      // 3. Guarda y marca listo para análisis (Fase 4).
      saveTranscript(id, text, "auto", "whisper-1");
      setVideoStatus(id, "analysing");
      processed++;
      console.log(`[whisper] video ${id}: ${text.length} chars transcritos`);
    } catch (e) {
      const msg = (e as Error).message.slice(0, 500);
      console.warn(`[whisper] video ${id} falló:`, msg);
      setVideoStatus(id, "error", msg);
      errors++;
    } finally {
      try { if (existsSync(audioPath)) rmSync(audioPath); } catch { /* noop */ }
    }
  }

  return { processed, errors, noKey };
}
