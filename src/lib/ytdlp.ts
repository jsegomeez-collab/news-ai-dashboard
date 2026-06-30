import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(execFile);

export type YtdlpVideoMeta = {
  id: string;
  title: string | null;
  url: string | null;
  webpage_url: string | null;
  description: string | null;
  duration: number | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  repost_count: number | null;
  thumbnail: string | null;
  upload_date: string | null; // YYYYMMDD
  extractor_key: string | null;
  media_url?: string | null;  // mp4 directo (solo Instagram vía Apify); yt-dlp no lo rellena
  published_iso?: string | null; // ISO 8601 directo (proveedores que ya lo dan, p.ej. Apify)
};

// Comprueba si yt-dlp está disponible en PATH.
export async function ytdlpAvailable(): Promise<boolean> {
  try {
    await execAsync("yt-dlp", ["--version"], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

// Obtiene los últimos N videos de un perfil usando --flat-playlist (rápido).
// Devuelve metadatos básicos: title, url, view_count, duration, thumbnail.
// likes/comments pueden ser null dependiendo de la plataforma.
export async function fetchRecentVideos(
  profileUrl: string,
  limit = 20
): Promise<YtdlpVideoMeta[]> {
  const { stdout } = await execAsync(
    "yt-dlp",
    [
      "--flat-playlist",
      "--dump-json",
      "--playlist-items", `1:${limit}`,
      "--no-warnings",
      "--quiet",
      "--no-download",
      "--extractor-args", "youtube:skip=dash,hls",
      profileUrl,
    ],
    { timeout: 120_000 }
  );

  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try { return [JSON.parse(line) as YtdlpVideoMeta]; }
      catch { return []; }
    });
}

// Obtiene metadatos COMPLETOS de un único video (más lento pero incluye likes/comentarios).
export async function fetchFullMeta(videoUrl: string): Promise<YtdlpVideoMeta | null> {
  try {
    const { stdout } = await execAsync(
      "yt-dlp",
      ["--dump-json", "--no-download", "--no-warnings", "--quiet", videoUrl],
      { timeout: 60_000 }
    );
    const line = stdout.trim().split("\n")[0];
    if (!line) return null;
    return JSON.parse(line) as YtdlpVideoMeta;
  } catch {
    return null;
  }
}

// Descarga solo el audio de un video a una ruta determinada (para transcripción).
// Requiere ffmpeg instalado para la conversión a mp3.
export async function downloadAudio(videoUrl: string, outPath: string): Promise<void> {
  await execAsync(
    "yt-dlp",
    [
      "--extract-audio",
      "--audio-format", "mp3",
      "--audio-quality", "5",       // calidad media: suficiente para Whisper
      "--no-playlist",
      "--no-warnings",
      "--quiet",
      "-o", outPath,
      videoUrl,
    ],
    { timeout: 300_000 }
  );
}

// Extrae la URL de página de un resultado flat-playlist.
export function videoPageUrl(v: YtdlpVideoMeta): string {
  if (v.webpage_url) return v.webpage_url;
  if (v.url && v.url.startsWith("http")) return v.url;
  // Fallback: construir URL por ID si es YouTube
  if (v.id && v.extractor_key?.toLowerCase().includes("youtube")) {
    return `https://www.youtube.com/watch?v=${v.id}`;
  }
  return v.url ?? v.id ?? "";
}

// Convierte la fecha YYYYMMDD de yt-dlp a ISO 8601.
export function parseYtdlpDate(d: string | null): string | null {
  if (!d || d.length !== 8) return null;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00.000Z`;
}
