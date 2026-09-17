import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getContentItem, updateContentItem, deleteContentItem, linkTargetOwnedBy } from "@/lib/contentItems";
import { DRIVE_STATUSES } from "@/lib/driveUi";
import { readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  return params.then(({ id }) => {
    const item = getContentItem(user.id, Number(id));
    if (!item) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ item });
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  const itemId = Number(id);
  if (!getContentItem(user.id, itemId)) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = await readJsonBody<{
    status?: string;
    scheduledDate?: string;
    linkedType?: "script" | "competitor_script" | null;
    linkedId?: number | null;
    title?: string | null;
    notes?: string | null;
  }>(req);

  if (body.status !== undefined && !(DRIVE_STATUSES as readonly string[]).includes(body.status)) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  }
  if (body.linkedType !== undefined && body.linkedType !== null) {
    if (!body.linkedId || !linkTargetOwnedBy(user.id, body.linkedType, body.linkedId)) {
      return NextResponse.json({ error: "Guion a vincular no encontrado" }, { status: 404 });
    }
  }

  updateContentItem(user.id, itemId, {
    status: body.status,
    scheduledDate: body.scheduledDate,
    linkedType: body.linkedType,
    linkedId: body.linkedType === null ? null : body.linkedId,
    title: body.title,
    notes: body.notes,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  const ok = deleteContentItem(user.id, Number(id));
  if (!ok) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
