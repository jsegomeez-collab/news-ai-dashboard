import { createReadStream, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import OpenAI from "openai";
import { readUserSettings } from "./settings";
import { pendingVideosWithUser, setVideoStatus, saveTranscript, type PendingVideo } from "./competitor";
import { downloadAudio, ytdlpAvailable } from "./ytdlp";
import { refreshReelMediaUrl } from "./providers/instagram";

const WHISPER_MAX_BYTES = 24 * 1024 * 1024; // Whisper API: límite 25MB, dejamos margen.

// Una clave de Anthropic ("sk-ant-...") también empieza por "sk-", así que un
// simple startsWith("sk-") aceptaba por error una clave de Anthropic pegada
// en el campo de OpenAI, dejando pasar la validación para fallar más tarde
// con un 401 crudo de la API en vez del aviso claro que existe para esto.
export function isOpenAiKeyFormat(key: string): boolean {
  return key.startsWith("sk-") && !key.startsWith("sk-ant-");
}

// Clientes OpenAI por API key (reutilizados). Acotado a un tamaño máximo para
// que rotar claves repetidamente en Ajustes no acumule clientes sin límite
// durante la vida del proceso.
const _openaiClients = new Map<string, OpenAI>();
const MAX_CACHED_CLIENTS = 50;
function openaiClient(apiKey: string): OpenAI {
  let c = _openaiClients.get(apiKey);
  if (!c) {
    c = new OpenAI({ apiKey });
    if (_openaiClients.size >= MAX_CACHED_CLIENTS) {
      const oldest = _openaiClients.keys().next().value;
      if (oldest !== undefined) _openaiClients.delete(oldest);
    }
    _openaiClients.set(apiKey, c);
  }
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

// Descarga una URL directa (mp4/mp3) a un archivo con guardia de tamaño.
async function fetchToFile(url: string, outPath: string): Promise<void> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!resp.ok) throw new Error(`descarga HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length > WHISPER_MAX_BYTES) {
    throw new Error(`video ${(buf.length / 1048576).toFixed(1)}MB supera el límite de Whisper (24MB)`);
  }
  writeFileSync(outPath, buf);
}

// Instagram: descarga el mp4 directo. Las URLs de Apify caducan, así que si la
// guardada falla (o no existe) se re-obtiene una fresca vía Apify y se reintenta.
async function downloadInstagramMedia(pv: PendingVideo, apifyToken: string, outPath: string): Promise<void> {
  let url = pv.media_url ?? (apifyToken ? await refreshReelMediaUrl(pv.video_url, apifyToken) : null);
  if (!url) throw new Error("sin URL de video de Instagram (revisa el token de Apify en Ajustes)");

  try {
    await fetchToFile(url, outPath);
  } catch (e) {
    if (!apifyToken) throw e;
    const fresh = await refreshReelMediaUrl(pv.video_url, apifyToken); // URL probablemente caducada
    if (!fresh) throw e;
    await fetchToFile(fresh, outPath);
  }
}

export type TranscribeResult = { processed: number; errors: number; noKey: number };

// Transcribe un único video (para el botón manual en la UI).
export async function transcribeOneVideo(
  pv: PendingVideo,
  userId: number
): Promise<{ ok: boolean; error?: string }> {
  const settings = readUserSettings(userId);
  if (!isOpenAiKeyFormat(settings.openaiKey)) {
    return { ok: false, error: "Configura tu clave de OpenAI en Ajustes para transcribir." };
  }

  const isInstagram = pv.platform === "instagram";
  const mediaPath = join(tmpdir(), `comp-${pv.id}-${Date.now()}.${isInstagram ? "mp4" : "mp3"}`);
  setVideoStatus(pv.id, "transcribing");

  try {
    if (isInstagram) {
      await downloadInstagramMedia(pv, settings.apifyToken, mediaPath);
    } else {
      const hasYtdlp = await ytdlpAvailable();
      if (!hasYtdlp) throw new Error("yt-dlp no instalado (necesario para YouTube/TikTok)");
      await downloadAudio(pv.video_url, mediaPath);
    }
    if (!existsSync(mediaPath)) throw new Error("no se generó el archivo de audio/video");

    const text = await transcribeFile(settings.openaiKey, mediaPath);
    if (!text) throw new Error("Whisper devolvió transcripción vacía");

    saveTranscript(pv.id, text, "auto", "whisper-1");
    setVideoStatus(pv.id, "analysing");
    console.log(`[whisper] video ${pv.id} (${pv.platform}): ${text.length} chars transcritos`);
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 500);
    console.warn(`[whisper] video ${pv.id} falló:`, msg);
    setVideoStatus(pv.id, "error", msg);
    return { ok: false, error: msg };
  } finally {
    try { if (existsSync(mediaPath)) rmSync(mediaPath); } catch { /* noop */ }
  }
}

// Procesa los videos pendientes de transcripción (máx. `limit` por ciclo para
// no bloquear el worker). Sin userId: pendientes de todos los usuarios (worker
// de fondo). Con userId: solo los de ese usuario (endpoints HTTP por-usuario).
export async function transcribePendingVideos(limit = 5, userId?: number): Promise<TranscribeResult> {
  const pending = pendingVideosWithUser(limit, userId);
  if (pending.length === 0) return { processed: 0, errors: 0, noKey: 0 };

  let hasYtdlp: boolean | null = null; // se comprueba solo si hay videos de youtube/tiktok
  let processed = 0, errors = 0, noKey = 0;

  for (const pv of pending) {
    const settings = readUserSettings(pv.user_id);
    if (!isOpenAiKeyFormat(settings.openaiKey)) { noKey++; continue; }

    const isInstagram = pv.platform === "instagram";
    const mediaPath = join(tmpdir(), `comp-${pv.id}-${Date.now()}.${isInstagram ? "mp4" : "mp3"}`);
    setVideoStatus(pv.id, "transcribing");

    try {
      // 1. Conseguir el audio/video.
      if (isInstagram) {
        await downloadInstagramMedia(pv, settings.apifyToken, mediaPath);
      } else {
        if (hasYtdlp === null) hasYtdlp = await ytdlpAvailable();
        if (!hasYtdlp) throw new Error("yt-dlp no instalado (necesario para YouTube/TikTok)");
        await downloadAudio(pv.video_url, mediaPath);
      }
      if (!existsSync(mediaPath)) throw new Error("no se generó el archivo de audio/video");

      // 2. Transcribir con Whisper.
      const text = await transcribeFile(settings.openaiKey, mediaPath);
      if (!text) throw new Error("Whisper devolvió transcripción vacía");

      // 3. Guardar y marcar listo para análisis (Fase 4).
      saveTranscript(pv.id, text, "auto", "whisper-1");
      setVideoStatus(pv.id, "analysing");
      processed++;
      console.log(`[whisper] video ${pv.id} (${pv.platform}): ${text.length} chars transcritos`);
    } catch (e) {
      const msg = (e as Error).message.slice(0, 500);
      console.warn(`[whisper] video ${pv.id} falló:`, msg);
      setVideoStatus(pv.id, "error", msg);
      errors++;
    } finally {
      try { if (existsSync(mediaPath)) rmSync(mediaPath); } catch { /* noop */ }
    }
  }

  return { processed, errors, noKey };
}
