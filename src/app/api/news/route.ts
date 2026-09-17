import { NextRequest, NextResponse } from "next/server";
import { listNews, countNews } from "@/lib/queries";
import { getUser } from "@/lib/auth";
import { readUserSettings } from "@/lib/settings";
import { parseIntParam } from "@/lib/http";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const minParam = sp.get("min");
  const defaultMin = readUserSettings(user.id).newsMinRelevance;
  const min = minParam !== null ? parseIntParam(minParam, defaultMin, 0, 100) : defaultMin;
  const pageSize = parseIntParam(sp.get("pageSize"), 50, 1, 200);
  const page = parseIntParam(sp.get("page"), 1, 1, 1_000_000);
  const offset = (page - 1) * pageSize;

  const total = countNews(user.id, min);
  const items = listNews(user.id, { minRelevance: min, limit: pageSize, offset });
  return NextResponse.json({ items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) });
}
