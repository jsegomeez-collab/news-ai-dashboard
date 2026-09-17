import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { updateCompetitorScriptStatus } from "@/lib/competitor";
import { isStatus } from "@/lib/status";
import { readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  const body = await readJsonBody<{ status?: string }>(req);
  if (body.status) {
    if (!isStatus(body.status)) return NextResponse.json({ error: "estado inválido" }, { status: 400 });
    updateCompetitorScriptStatus(user.id, Number(id), body.status);
  }
  return NextResponse.json({ ok: true });
}
