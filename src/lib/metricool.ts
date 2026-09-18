import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

// Cliente de la API REST de Metricool (NO su MCP: como HeyGen, el MCP de
// Metricool está pensado para agentes conversacionales con OAuth de
// navegador, no para un worker desatendido en cron). Verificado en vivo
// contra el swagger real (https://app.metricool.com/api/swagger.json) y con
// llamadas reales (token falso -> 401 limpio, no 404) a los 3 endpoints que
// se usan aquí: /admin/simpleProfiles, /v2/media/s3/upload-transactions,
// /v2/scheduler/posts. El campo `providers[].id` se asume igual al blogId
// (no hay forma de confirmarlo sin una cuenta real) — si Metricool lo
// rechaza, es el primer sitio a revisar.
const BASE = "https://app.metricool.com/api";

async function mcFetch<T>(userToken: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "X-Mc-Auth": userToken, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* respuesta no-JSON (p.ej. HTML de error) — se trata como fallo genérico abajo */
  }
  if (!res.ok) {
    const j = json as { detail?: string; title?: string } | null;
    throw new Error((j?.detail ?? j?.title ?? `Metricool HTTP ${res.status}`).slice(0, 300));
  }
  return json as T;
}

export type MetricoolBlog = {
  id: number;
  label: string;
  title: string | null;
  picture: string | null;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
};

// Lista las cuentas/marcas conectadas en tu panel de Metricool — para que en
// Ajustes elijas el blogId de cada cuenta destino sin tener que ir a buscarlo
// a mano en la URL de Metricool.
export async function listBlogs(userToken: string): Promise<MetricoolBlog[]> {
  return mcFetch<MetricoolBlog[]>(userToken, "/admin/simpleProfiles");
}

type S3UploadResponse = {
  key: string;
  bucket: string;
  uploadType: "SIMPLE" | "MULTIPART";
  presignedUrl?: string;
  fileUrl?: string;
  uploadId?: string;
  parts?: { partNumber: number; presignedUrl: string; startByte: number; endByte: number }[];
};

// Sube el vídeo a Metricool por su flujo de subida directa a S3 (presigned
// URLs) y devuelve la URL final que luego se referencia en el post
// programado. Soporta tanto SIMPLE (<5MB) como MULTIPART — la partición
// exacta la decide el propio Metricool en la respuesta, este código solo
// obedece los rangos de bytes que le indica.
export async function uploadVideo(
  userToken: string,
  userId: string,
  blogId: string,
  filePath: string
): Promise<string> {
  const buf = await readFile(filePath);
  const size = (await stat(filePath)).size;
  const hash = createHash("sha256").update(buf).digest("base64");
  const qs = `userId=${encodeURIComponent(userId)}&blogId=${encodeURIComponent(blogId)}`;

  const started = await mcFetch<{ data: S3UploadResponse }>(userToken, `/v2/media/s3/upload-transactions?${qs}`, {
    method: "PUT",
    body: JSON.stringify({
      resourceType: "planner",
      contentType: "video/mp4",
      fileExtension: "mp4",
      parts: [{ size, startByte: 0, endByte: size, hash }],
    }),
  });
  const upload = started.data;

  if (upload.uploadType === "SIMPLE") {
    if (!upload.presignedUrl) throw new Error("Metricool: subida SIMPLE sin presignedUrl");
    const put = await fetch(upload.presignedUrl, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4" },
      body: buf,
      signal: AbortSignal.timeout(180_000),
    });
    if (!put.ok) throw new Error(`Metricool: subida a S3 falló (HTTP ${put.status})`);

    const completed = await mcFetch<{ data: { fileUrl: string; convertedFileUrl?: string } }>(
      userToken,
      `/v2/media/s3/upload-transactions?${qs}`,
      { method: "PATCH", body: JSON.stringify({ simple: { fileUrl: upload.fileUrl } }) }
    );
    return completed.data.convertedFileUrl || completed.data.fileUrl;
  }

  // MULTIPART: subir cada parte al rango de bytes exacto que indica Metricool.
  if (!upload.uploadId || !upload.parts?.length) throw new Error("Metricool: subida MULTIPART sin uploadId/parts");
  const completedParts: { partNumber: number; etag: string }[] = [];
  for (const part of upload.parts) {
    const chunk = buf.subarray(part.startByte, part.endByte);
    const put = await fetch(part.presignedUrl, {
      method: "PUT",
      body: chunk,
      signal: AbortSignal.timeout(180_000),
    });
    if (!put.ok) throw new Error(`Metricool: subida de parte ${part.partNumber} falló (HTTP ${put.status})`);
    const etag = put.headers.get("etag");
    if (!etag) throw new Error(`Metricool: S3 no devolvió ETag para la parte ${part.partNumber}`);
    completedParts.push({ partNumber: part.partNumber, etag });
  }

  const completed = await mcFetch<{ data: { fileUrl: string; convertedFileUrl?: string } }>(
    userToken,
    `/v2/media/s3/upload-transactions?${qs}`,
    {
      method: "PATCH",
      body: JSON.stringify({ multipart: { uploadId: upload.uploadId, key: upload.key, parts: completedParts } }),
    }
  );
  return completed.data.convertedFileUrl || completed.data.fileUrl;
}

export type MetricoolNetwork = "instagram" | "tiktok" | "youtube";

// Crea el post programado en Metricool. publicationDateUTC va en formato
// "YYYY-MM-DDTHH:mm:ss" (sin offset) + timezone "UTC" por separado, porque la
// API separa dateTime/timezone en vez de aceptar un ISO con Z. autoPublish
// pone en manos de METRICOOL el momento exacto de publicar — no hace falta
// que este worker esté despierto justo a esa hora, solo crear el post con
// antelación.
export async function createScheduledPost(opts: {
  userToken: string;
  userId: string;
  blogId: string;
  network: MetricoolNetwork;
  text: string;
  mediaUrl: string;
  publicationDateUTC: string;
}): Promise<string> {
  const qs = `userId=${encodeURIComponent(opts.userId)}&blogId=${encodeURIComponent(opts.blogId)}`;
  const body: Record<string, unknown> = {
    text: opts.text,
    publicationDate: { dateTime: opts.publicationDateUTC, timezone: "UTC" },
    providers: [{ network: opts.network, id: opts.blogId }],
    media: [opts.mediaUrl],
    autoPublish: true,
  };
  if (opts.network === "instagram") body.instagramData = { type: "REEL" };

  const res = await mcFetch<{ data: { id: number } }>(opts.userToken, `/v2/scheduler/posts?${qs}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return String(res.data.id);
}
