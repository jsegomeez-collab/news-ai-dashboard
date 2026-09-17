import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getFolder, renameFolder, deleteFolder } from "@/lib/drive";
import { readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  const folderId = Number(id);
  if (!getFolder(user.id, folderId)) return NextResponse.json({ error: "Carpeta no encontrada" }, { status: 404 });

  const body = await readJsonBody<{ name?: string }>(req);
  if (!body.name?.trim()) return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });

  renameFolder(user.id, folderId, body.name);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  const folderId = Number(id);
  if (!getFolder(user.id, folderId)) return NextResponse.json({ error: "Carpeta no encontrada" }, { status: 404 });

  deleteFolder(user.id, folderId);
  return NextResponse.json({ ok: true });
}
