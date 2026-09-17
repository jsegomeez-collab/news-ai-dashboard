import { mkdirSync, createWriteStream, writeFileSync, unlinkSync, existsSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { randomBytes } from "node:crypto";
import { dbInfo } from "./db";

// Los audios/videos que el usuario sube (su propia voz leyendo el guion, o
// cualquier archivo del Drive) viven junto a la BD, en el MISMO disco
// persistente — si la BD sobrevive a un redeploy, estos archivos también
// deben hacerlo. `subdir` solo organiza el disco (guiones vs. Drive), no
// afecta a nada de la lógica.
function uploadsDir(subdir: string): string {
  const dir = join(dirname(dbInfo().path), subdir);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export const MAX_UPLOAD_BYTES = 300 * 1024 * 1024; // 300MB: de sobra para audio, generoso para video corto.

const ALLOWED_EXT = new Set([
  ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".webm",
  ".mp4", ".mov", ".avi", ".mkv",
]);

// El mime que declara el navegador al subir es un dato de entrada MÁS —
// cualquiera puede mandar un archivo con contenido HTML/SVG declarando
// "video/mp4" (el prefijo audio/video* no verifica nada del contenido real).
// Por eso esta misma lista sirve para dos cosas: (1) aceptar razonablemente
// el upload y (2) sobre todo, decidir en el momento de SERVIR el archivo si
// el Content-Type guardado es de fiar — ver safeMediaContentType() más abajo.
const SAFE_MEDIA_TYPES = new Set([
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave",
  "audio/mp4", "audio/x-m4a", "audio/aac", "audio/ogg", "audio/flac",
  "audio/webm",
  "video/mp4", "video/webm", "video/quicktime", "video/x-msvideo",
  "video/x-matroska", "video/ogg",
]);

export function isAllowedMediaType(mime: string, filename: string): boolean {
  if (SAFE_MEDIA_TYPES.has(mime)) return true;
  if (mime.startsWith("audio/") || mime.startsWith("video/")) return true;
  return ALLOWED_EXT.has(extname(filename).toLowerCase());
}

// Nunca hay que confiar en el mime guardado tal cual para servirlo de vuelta:
// si no está en la lista de tipos reales conocidos, se sirve como descarga
// genérica (application/octet-stream + Content-Disposition: attachment) para
// que el navegador NUNCA lo renderice/ejecute inline, pase lo que pase con lo
// que el que lo subió haya declarado. Aplica tanto a archivos nuevos como a
// los que ya estaban guardados antes de este fix (la sanitización es en el
// momento de servir, no depende de haber limpiado nada retroactivamente).
export function safeMediaContentType(mime: string | null | undefined): { contentType: string; inline: boolean } {
  if (mime && SAFE_MEDIA_TYPES.has(mime)) return { contentType: mime, inline: true };
  return { contentType: "application/octet-stream", inline: false };
}

// Guarda el archivo subido con un nombre único (no el original, para no
// colisionar ni depender de que el nombre venga "limpio") y devuelve la ruta
// absoluta guardada en la BD.
export async function saveUpload(file: File, subdir = "uploads"): Promise<{ path: string; size: number }> {
  const dir = uploadsDir(subdir);
  const ext = extname(file.name) || "";
  const name = `${Date.now()}-${randomBytes(8).toString("hex")}${ext}`;
  const path = join(dir, name);

  const buf = Buffer.from(await file.arrayBuffer());
  await new Promise<void>((resolve, reject) => {
    const ws = createWriteStream(path);
    ws.on("error", reject);
    ws.on("finish", resolve);
    ws.end(buf);
  });
  return { path, size: statSync(path).size };
}

// Igual que saveUpload, pero para bytes que ya tenemos en memoria (el vídeo
// descargado de HeyGen vía fetch, no un File subido desde el navegador).
export function saveBuffer(buf: Buffer, originalName: string, subdir = "uploads"): { path: string; size: number } {
  const dir = uploadsDir(subdir);
  const ext = extname(originalName) || "";
  const name = `${Date.now()}-${randomBytes(8).toString("hex")}${ext}`;
  const path = join(dir, name);
  writeFileSync(path, buf);
  return { path, size: buf.length };
}

export function deleteUploadIfExists(path: string | null): void {
  if (!path) return;
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    /* si ya no está, no pasa nada */
  }
}
