import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createFolder, getFolder } from "@/lib/drive";
import { readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await readJsonBody<{ name?: string; parentId?: number | null }>(req);
  if (!body.name?.trim()) return NextResponse.json({ error: "Falta el nombre de la carpeta" }, { status: 400 });

  const parentId = body.parentId ?? null;
  if (parentId !== null && (!Number.isFinite(parentId) || !getFolder(user.id, parentId))) {
    return NextResponse.json({ error: "Carpeta padre no encontrada" }, { status: 404 });
  }

  const id = createFolder(user.id, body.name, parentId);
  return NextResponse.json({ ok: true, id });
}
