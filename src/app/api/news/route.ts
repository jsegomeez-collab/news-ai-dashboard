import { NextRequest, NextResponse } from "next/server";
import { listNews, countNews } from "@/lib/queries";
import { getUser } from "@/lib/auth";
import { readUserSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const minParam = sp.get("min");
  const min = minParam !== null ? Number(minParam) : readUserSettings(user.id).newsMinRelevance;
  const pageSize = Math.max(1, Math.min(200, Number(sp.get("pageSize") ?? "50")));
  const page = Math.max(1, Number(sp.get("page") ?? "1"));
  const offset = (page - 1) * pageSize;

  const total = countNews(user.id, min);
  const items = listNews(user.id, { minRelevance: min, limit: pageSize, offset });
  return NextResponse.json({ items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) });
}
