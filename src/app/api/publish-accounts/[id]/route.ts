import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { updatePublishAccount, deletePublishAccount } from "@/lib/publishAccounts";
import { readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;

  const body = await readJsonBody<{ active?: boolean; label?: string }>(req);
  updatePublishAccount(user.id, Number(id), body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  deletePublishAccount(user.id, Number(id));
  return NextResponse.json({ ok: true });
}
