import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { deleteSharedLink } from "@/lib/sharedLinks";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  const ok = deleteSharedLink(user.id, Number(id));
  if (!ok) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
