import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { listAdaptedScripts } from "@/lib/competitor";
import { parseIntParam } from "@/lib/http";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const limit = parseIntParam(req.nextUrl.searchParams.get("limit"), 100, 1, 300);
  return NextResponse.json({ scripts: listAdaptedScripts(user.id, limit) });
}
