import { NextRequest, NextResponse } from "next/server";
import { createReadStream, existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { getUser } from "@/lib/auth";
import { getScriptMedia, setScriptMedia, clearScriptMedia } from "@/lib/competitor";
import { saveUpload, deleteUploadIfExists, isAllowedMediaType, safeMediaContentType, MAX_UPLOAD_BYTES } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function safeFilename(name: string): string {
  return name.replace(/["\r\n]/g, "").slice(0, 200) || "archivo";
}

// Sube (o reemplaza) el audio/video que el usuario lee del guion, para que
// el editor lo agarre y lo use como referencia de clonación con IA.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  const scriptId = Number(id);

  const existing = getScriptMedia(user.id, scriptId);
  if (existing === null) return NextResponse.json({ error: "Guion no encontrado" }, { status: 404 });

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Archivo demasiado grande (máx. ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB)` },
      { status: 413 }
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }
  if (!isAllowedMediaType(file.type, file.name)) {
    return NextResponse.json({ error: "Formato no admitido (usa un audio o video)" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Archivo demasiado grande (máx. ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB)` },
      { status: 413 }
    );
  }

  const previousPath = existing.media_path;
  const saved = await saveUpload(file);
  setScriptMedia(user.id, scriptId, {
    path: saved.path,
    originalName: safeFilename(file.name),
    mime: file.type || "application/octet-stream",
    size: saved.size,
  });
  // Solo se borra el anterior una vez el nuevo ya está guardado y confirmado en BD.
  deleteUploadIfExists(previousPath);

  return NextResponse.json({ ok: true, originalName: safeFilename(file.name), size: saved.size });
}

// Sirve el archivo para reproducirlo/descargarlo — con soporte de Range para
// que el reproductor de audio/video pueda buscar (seek) sin bajarlo entero.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  const scriptId = Number(id);

  const media = getScriptMedia(user.id, scriptId);
  if (!media?.media_path || !existsSync(media.media_path)) {
    return NextResponse.json({ error: "Sin archivo" }, { status: 404 });
  }

  const stat = statSync(media.media_path);
  const { contentType, inline } = safeMediaContentType(media.media_mime);
  const filename = safeFilename(media.media_original_name || "media");
  const disposition = `${inline ? "inline" : "attachment"}; filename="${filename}"`;
  const range = req.headers.get("range");

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match?.[1] ? parseInt(match[1], 10) : 0;
    const end = match?.[2] ? parseInt(match[2], 10) : stat.size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= stat.size) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    }
    const nodeStream = createReadStream(media.media_path, { start, end });
    return new NextResponse(Readable.toWeb(nodeStream) as unknown as ReadableStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Content-Type": contentType,
        "Content-Disposition": disposition,
      },
    });
  }

  const nodeStream = createReadStream(media.media_path);
  return new NextResponse(Readable.toWeb(nodeStream) as unknown as ReadableStream, {
    headers: {
      "Content-Length": String(stat.size),
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Content-Disposition": disposition,
    },
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  const scriptId = Number(id);

  const path = clearScriptMedia(user.id, scriptId);
  deleteUploadIfExists(path);
  return NextResponse.json({ ok: true });
}
