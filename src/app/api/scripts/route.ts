import { NextRequest, NextResponse } from "next/server";
import { listScripts } from "@/lib/queries";
import { getUser } from "@/lib/auth";
import { parseIntParam } from "@/lib/http";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const min = parseIntParam(req.nextUrl.searchParams.get("min"), 0, 0, 10);
  const limit = parseIntParam(req.nextUrl.searchParams.get("limit"), 300, 1, 1000);
  return NextResponse.json({ items: listScripts(user.id, { minScore: min, limit }) });
}
