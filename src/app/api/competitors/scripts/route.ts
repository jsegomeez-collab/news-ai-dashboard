import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { listAdaptedScripts, listAdaptedScriptIds, countAdaptedScripts, type AdaptedScriptSort } from "@/lib/competitor";
import { parseIntParam } from "@/lib/http";

export const dynamic = "force-dynamic";

const VALID_SORTS: AdaptedScriptSort[] = ["recent", "views", "likes", "comments", "viral"];

export function GET(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const sortRaw = sp.get("sort");
  const sort = (VALID_SORTS as string[]).includes(sortRaw ?? "") ? (sortRaw as AdaptedScriptSort) : "recent";
  const accountIdRaw = sp.get("accountId") ? Number(sp.get("accountId")) : undefined;
  const accountId = Number.isFinite(accountIdRaw) ? accountIdRaw : undefined;
  const format = sp.get("format") || undefined;
  const status = sp.get("status") || undefined;

  if (sp.get("idsOnly")) {
    return NextResponse.json({ ids: listAdaptedScriptIds(user.id, { accountId, format, status, sort }) });
  }

  const pageSize = parseIntParam(sp.get("pageSize"), 20, 1, 100);
  const page = parseIntParam(sp.get("page"), 1, 1, 1_000_000);
  const offset = (page - 1) * pageSize;

  const filters = { accountId, format, status, sort };
  const total = countAdaptedScripts(user.id, filters);
  const scripts = listAdaptedScripts(user.id, { ...filters, limit: pageSize, offset });

  return NextResponse.json({
    scripts,
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  });
}
