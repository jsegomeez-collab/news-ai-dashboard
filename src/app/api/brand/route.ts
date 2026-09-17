import { NextRequest, NextResponse } from "next/server";
import { getBrandDocs, setBrandDoc, listSwipe } from "@/lib/brand";
import { BRAND_KINDS, type BrandKind } from "@/lib/status";
import { getUser } from "@/lib/auth";
import { readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  return NextResponse.json({ docs: getBrandDocs(user.id), swipe: listSwipe(user.id) });
}

export async function POST(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const body = await readJsonBody<{ kind?: string; content?: string }>(req);
  if (!body.kind || !(BRAND_KINDS as readonly string[]).includes(body.kind)) {
    return NextResponse.json({ error: "kind inválido" }, { status: 400 });
  }
  setBrandDoc(user.id, body.kind as BrandKind, body.content ?? "");
  return NextResponse.json({ ok: true });
}
