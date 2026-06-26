import { NextRequest, NextResponse } from "next/server";
import { listNews } from "@/lib/queries";
import { getUser } from "@/lib/auth";
import { readUserSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const minParam = req.nextUrl.searchParams.get("min");
  const min = minParam !== null ? Number(minParam) : readUserSettings(user.id).newsMinRelevance;
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "120");
  return NextResponse.json({ items: listNews(user.id, { minRelevance: min, limit }) });
}
