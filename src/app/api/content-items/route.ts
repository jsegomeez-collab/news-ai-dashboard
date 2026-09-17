import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createContentItem, linkTargetOwnedBy, listContentItemsByLink, listAllContentItems } from "@/lib/contentItems";
import { readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";

// Sin parámetros: todas las publicaciones del usuario (vista Pipeline de
// /calendario). Con linkedType+linkedId: solo la(s) vinculada(s) a ese guion
// (comprobación de "¿ya está programado?" desde /adaptados).
export function GET(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const linkedType = req.nextUrl.searchParams.get("linkedType");
  const linkedId = Number(req.nextUrl.searchParams.get("linkedId"));
  if (!linkedType && !linkedId) return NextResponse.json({ items: listAllContentItems(user.id) });
  if (!linkedType || !linkedId) return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  return NextResponse.json({ items: listContentItemsByLink(user.id, linkedType, linkedId) });
}

export async function POST(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await readJsonBody<{
    linkedType?: "script" | "competitor_script" | null;
    linkedId?: number | null;
    title?: string | null;
    scheduledDate?: string;
    status?: string;
  }>(req);

  if (!body.scheduledDate) return NextResponse.json({ error: "Falta la fecha" }, { status: 400 });
  if (body.linkedType && (!body.linkedId || !linkTargetOwnedBy(user.id, body.linkedType, body.linkedId))) {
    return NextResponse.json({ error: "Guion a vincular no encontrado" }, { status: 404 });
  }
  if (!body.linkedType && !body.title?.trim()) {
    return NextResponse.json({ error: "Vincula un guion o ponle un título" }, { status: 400 });
  }

  const id = createContentItem(user.id, {
    linkedType: body.linkedType ?? null,
    linkedId: body.linkedId ?? null,
    title: body.title,
    scheduledDate: body.scheduledDate,
    status: body.status,
  });
  return NextResponse.json({ ok: true, id });
}
