import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { listVideos } from "@/lib/competitor";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const accountId = sp.get("accountId") ? Number(sp.get("accountId")) : undefined;
  const status = sp.get("status") ?? undefined;
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit") ?? "100")));

  const videos = listVideos(user.id, { accountId, status, limit });
  return NextResponse.json({ videos });
}
