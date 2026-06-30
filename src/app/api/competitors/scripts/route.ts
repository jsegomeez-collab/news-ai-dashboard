import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { listAdaptedScripts } from "@/lib/competitor";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const limit = Math.min(300, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? "100")));
  return NextResponse.json({ scripts: listAdaptedScripts(user.id, limit) });
}
