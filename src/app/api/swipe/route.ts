import { NextRequest, NextResponse } from "next/server";
import { addSwipe, deleteSwipe, listSwipe } from "@/lib/brand";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ items: listSwipe() });
}

export async function POST(req: NextRequest) {
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
  const id = addSwipe({
    title: b.title.trim(),
    platform: b.platform?.trim() || null,
    author: b.author?.trim() || null,
    content: b.content.trim(),
    why: b.why?.trim() || null,
  });
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  deleteSwipe(id);
  return NextResponse.json({ ok: true });
}
