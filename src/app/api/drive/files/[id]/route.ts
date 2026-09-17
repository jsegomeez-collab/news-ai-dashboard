import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getFile, updateFile, deleteFile, linkTargetOwnedBy, DRIVE_STATUSES } from "@/lib/drive";
import { deleteUploadIfExists } from "@/lib/uploads";
import { readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  const fileId = Number(id);
  if (!getFile(user.id, fileId)) return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });

  const body = await readJsonBody<{
    status?: string;
    scheduledDate?: string | null;
    linkedType?: "script" | "competitor_script" | null;
    linkedId?: number | null;
    notes?: string | null;
  }>(req);

  if (body.status !== undefined && !(DRIVE_STATUSES as readonly string[]).includes(body.status)) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  }
  if (body.linkedType !== undefined && body.linkedType !== null) {
    const linkedId = body.linkedId;
    if (!linkedId || !linkTargetOwnedBy(user.id, body.linkedType, linkedId)) {
      return NextResponse.json({ error: "Guion a vincular no encontrado" }, { status: 404 });
    }
  }

  updateFile(user.id, fileId, {
    status: body.status,
    scheduledDate: body.scheduledDate,
    linkedType: body.linkedType,
    linkedId: body.linkedType === null ? null : body.linkedId,
    notes: body.notes,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  const fileId = Number(id);

  const path = deleteFile(user.id, fileId);
  if (path === null) return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  deleteUploadIfExists(path);
  return NextResponse.json({ ok: true });
}
