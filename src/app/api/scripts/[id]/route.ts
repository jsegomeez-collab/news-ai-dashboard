import { NextRequest, NextResponse } from "next/server";
import { setScriptStatus, upsertMetrics, ownsScript, type MetricsInput } from "@/lib/queries";
import { isStatus } from "@/lib/status";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await ctx.params;
  const scriptId = Number(id);
  if (!ownsScript(user.id, scriptId)) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { status?: string; metrics?: MetricsInput };
  if (body.status) {
    if (!isStatus(body.status)) return NextResponse.json({ error: "estado inválido" }, { status: 400 });
    setScriptStatus(user.id, scriptId, body.status);
  }
  if (body.metrics) upsertMetrics(user.id, scriptId, body.metrics);
  return NextResponse.json({ ok: true, id: scriptId });
}
