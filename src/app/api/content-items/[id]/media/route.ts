import { NextRequest, NextResponse } from "next/server";
import { createReadStream, existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { getUser } from "@/lib/auth";
import { getContentItem, setContentItemMedia, clearContentItemMedia, type MediaSlot } from "@/lib/contentItems";
import { saveUpload, deleteUploadIfExists, isAllowedMediaType, safeMediaContentType, MAX_UPLOAD_BYTES } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function safeFilename(name: string): string {
  return name.replace(/["\r\n]/g, "").slice(0, 200) || "archivo";
}

function parseSlot(req: NextRequest): MediaSlot | null {
  const s = req.nextUrl.searchParams.get("slot");
  return s === "audio" || s === "video" ? s : null;
}

// Sube (o reemplaza) el audio o el video de una publicación programada.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  const itemId = Number(id);
  const slot = parseSlot(req);
  if (!slot) return NextResponse.json({ error: "slot debe ser 'audio' o 'video'" }, { status: 400 });

  const existing = getContentItem(user.id, itemId);
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `Archivo demasiado grande (máx. ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB)` }, { status: 413 });
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
    return NextResponse.json({ error: `Archivo demasiado grande (máx. ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB)` }, { status: 413 });
  }

  const saved = await saveUpload(file, "content");
  const previous = setContentItemMedia(user.id, itemId, slot, {
    path: saved.path,
    originalName: safeFilename(file.name),
    mime: file.type || "application/octet-stream",
    size: saved.size,
  });
  deleteUploadIfExists(previous);

  return NextResponse.json({ ok: true, originalName: safeFilename(file.name), size: saved.size });
}

// Sirve el audio/video de una publicación, con soporte de Range para poder buscar.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  const slot = parseSlot(req);
  if (!slot) return NextResponse.json({ error: "slot debe ser 'audio' o 'video'" }, { status: 400 });

  const item = getContentItem(user.id, Number(id));
  const path = slot === "audio" ? item?.audio_path : item?.video_path;
  const rawMime = slot === "audio" ? item?.audio_mime : item?.video_mime;
  const originalName = (slot === "audio" ? item?.audio_original_name : item?.video_original_name) || "archivo";
  if (!item || !path || !existsSync(path)) return NextResponse.json({ error: "Sin archivo" }, { status: 404 });

  const stat = statSync(path);
  const { contentType, inline } = safeMediaContentType(rawMime);
  const filename = safeFilename(originalName);
  const disposition = `${inline ? "inline" : "attachment"}; filename="${filename}"`;
  const range = req.headers.get("range");

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match?.[1] ? parseInt(match[1], 10) : 0;
    const end = match?.[2] ? parseInt(match[2], 10) : stat.size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= stat.size) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    }
    const nodeStream = createReadStream(path, { start, end });
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

  const nodeStream = createReadStream(path);
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
  const slot = parseSlot(req);
  if (!slot) return NextResponse.json({ error: "slot debe ser 'audio' o 'video'" }, { status: 400 });

  const path = clearContentItemMedia(user.id, Number(id), slot);
  deleteUploadIfExists(path);
  return NextResponse.json({ ok: true });
}
