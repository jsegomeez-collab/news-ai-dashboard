import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { listVideos, countVideos, videoStatusCounts, deleteVideos } from "@/lib/competitor";
import { parseIntParam, readJsonBody } from "@/lib/http";

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

// Borrado múltiple: { ids: number[] }. Acotado al propio usuario dentro de
// deleteVideos — borra el video y en cascada su transcripción, análisis y
// guiones adaptados (nada queda huérfano ocupando espacio).
export async function DELETE(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await readJsonBody<{ ids?: number[] }>(req);
  const ids = Array.isArray(body.ids)
    ? body.ids.map(Number).filter((n) => Number.isFinite(n))
    : [];
  if (ids.length === 0) return NextResponse.json({ error: "ids requerido" }, { status: 400 });

  const deleted = deleteVideos(user.id, ids);
  return NextResponse.json({ ok: true, deleted });
}
