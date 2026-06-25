import { NextRequest, NextResponse } from "next/server";
import { getBrandDocs, setBrandDoc, listSwipe } from "@/lib/brand";
import { BRAND_KINDS, type BrandKind } from "@/lib/status";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ docs: getBrandDocs(), swipe: listSwipe() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { kind?: string; content?: string };
  if (!body.kind || !(BRAND_KINDS as readonly string[]).includes(body.kind)) {
    return NextResponse.json({ error: "kind inválido" }, { status: 400 });
  }
  setBrandDoc(body.kind as BrandKind, body.content ?? "");
  return NextResponse.json({ ok: true });
}
