import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { listVideos, countVideos, videoStatusCounts } from "@/lib/competitor";
import { parseIntParam } from "@/lib/http";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const accountIdRaw = sp.get("accountId") ? Number(sp.get("accountId")) : undefined;
  const accountId = Number.isFinite(accountIdRaw) ? accountIdRaw : undefined;
  const status = sp.get("status") ?? undefined;
  const pageSize = parseIntParam(sp.get("pageSize"), 20, 1, 100);
  const page = parseIntParam(sp.get("page"), 1, 1, 1_000_000);
  const offset = (page - 1) * pageSize;

  const total = countVideos(user.id, { accountId, status });
  const videos = listVideos(user.id, { accountId, status, limit: pageSize, offset });
  // Recuentos por status sobre TODOS los videos de la cuenta filtrada (no solo
  // la página actual), para que la UI pueda mostrar "N pendientes" reales.
  const counts = videoStatusCounts(user.id, accountId);

  return NextResponse.json({
    videos,
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    counts,
  });
}
