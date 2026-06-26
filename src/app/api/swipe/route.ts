import { NextRequest, NextResponse } from "next/server";
import { addSwipe, deleteSwipe, listSwipe } from "@/lib/brand";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  return NextResponse.json({ items: listSwipe(user.id) });
}

export async function POST(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as {
    title?: string;
    platform?: string;
    author?: string;
    content?: string;
    why?: string;
  };
  if (!b.title?.trim() || !b.content?.trim()) {
    return NextResponse.json({ error: "Faltan título o contenido" }, { status: 400 });
  }
  const id = addSwipe(user.id, {
    title: b.title.trim(),
    platform: b.platform?.trim() || null,
    author: b.author?.trim() || null,
    content: b.content.trim(),
    why: b.why?.trim() || null,
  });
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  deleteSwipe(user.id, id);
  return NextResponse.json({ ok: true });
}
