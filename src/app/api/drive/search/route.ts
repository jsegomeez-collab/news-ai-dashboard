import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { searchLinkTargets } from "@/lib/drive";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const q = req.nextUrl.searchParams.get("q") ?? "";
  return NextResponse.json({ results: searchLinkTargets(user.id, q) });
}
