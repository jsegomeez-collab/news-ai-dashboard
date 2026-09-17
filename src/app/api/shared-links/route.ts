import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { linkTargetOwnedBy } from "@/lib/contentItems";
import { createSharedLink, listSharedLinks, type SharedLinkItem } from "@/lib/sharedLinks";
import { readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  return NextResponse.json({ links: listSharedLinks(user.id) });
}

export async function POST(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await readJsonBody<{ items?: SharedLinkItem[]; title?: string | null }>(req);
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) return NextResponse.json({ error: "Selecciona al menos un guion" }, { status: 400 });

  for (const it of items) {
    if ((it.type !== "script" && it.type !== "competitor_script") || !linkTargetOwnedBy(user.id, it.type, it.id)) {
      return NextResponse.json({ error: "Alguno de los guiones seleccionados no es válido" }, { status: 404 });
    }
  }

  const token = createSharedLink(user.id, items, body.title);
  return NextResponse.json({ ok: true, token });
}
