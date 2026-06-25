import { NextRequest, NextResponse } from "next/server";
import { setScriptStatus, upsertMetrics, type MetricsInput } from "@/lib/queries";
import { isStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const scriptId = Number(id);
  const body = (await req.json().catch(() => ({}))) as {
    status?: string;
    metrics?: MetricsInput;
  };

  if (body.status) {
    if (!isStatus(body.status)) {
      return NextResponse.json({ error: "estado inválido" }, { status: 400 });
    }
    setScriptStatus(scriptId, body.status);
  }
  if (body.metrics) {
    upsertMetrics(scriptId, body.metrics);
  }
  return NextResponse.json({ ok: true, id: scriptId });
}
