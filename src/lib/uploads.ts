import { mkdirSync, createWriteStream, unlinkSync, existsSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { randomBytes } from "node:crypto";
import { dbInfo } from "./db";

// Los audios/videos que el usuario sube (su propia voz leyendo el guion,
// para que el editor los clone con IA) viven junto a la BD, en el MISMO
// disco persistente — si la BD sobrevive a un redeploy, estos archivos
// también deben hacerlo.
function uploadsDir(): string {
  const dir = join(dirname(dbInfo().path), "uploads");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export const MAX_UPLOAD_BYTES = 300 * 1024 * 1024; // 300MB: de sobra para audio, generoso para video corto.

const ALLOWED_EXT = new Set([
  ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".webm",
  ".mp4", ".mov", ".avi", ".mkv",
]);

export function isAllowedMediaType(mime: string, filename: string): boolean {
  if (mime.startsWith("audio/") || mime.startsWith("video/")) return true;
  return ALLOWED_EXT.has(extname(filename).toLowerCase());
}

// Guarda el archivo subido con un nombre único (no el original, para no
// colisionar ni depender de que el nombre venga "limpio") y devuelve la ruta
// absoluta guardada en la BD.
export async function saveUpload(file: File): Promise<{ path: string; size: number }> {
  const dir = uploadsDir();
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

export function deleteUploadIfExists(path: string | null): void {
  if (!path) return;
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    /* si ya no está, no pasa nada */
  }
}
