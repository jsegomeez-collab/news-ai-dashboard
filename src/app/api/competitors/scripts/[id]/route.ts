import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { updateCompetitorScriptStatus } from "@/lib/competitor";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { status?: string };
  if (body.status) updateCompetitorScriptStatus(user.id, Number(id), body.status);
  return NextResponse.json({ ok: true });
}
