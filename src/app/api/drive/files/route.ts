import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createFileRecord, getFolder } from "@/lib/drive";
import { saveUpload, isAllowedMediaType, MAX_UPLOAD_BYTES } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function safeFilename(name: string): string {
  return name.replace(/["\r\n]/g, "").slice(0, 200) || "archivo";
}

export async function POST(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Archivo demasiado grande (máx. ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB)` },
      { status: 413 }
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const folderIdRaw = form?.get("folderId");
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

  let folderId: number | null = null;
  if (typeof folderIdRaw === "string" && folderIdRaw.trim()) {
    folderId = Number(folderIdRaw);
    if (!Number.isFinite(folderId) || !getFolder(user.id, folderId)) {
      return NextResponse.json({ error: "Carpeta no encontrada" }, { status: 404 });
    }
  }

  const saved = await saveUpload(file, "drive");
  const kind = file.type.startsWith("video/") ? "video" : "audio";
  const id = createFileRecord(user.id, {
    folderId,
    originalName: safeFilename(file.name),
    path: saved.path,
    mime: file.type || "application/octet-stream",
    size: saved.size,
    kind,
  });

  return NextResponse.json({ ok: true, id });
}
