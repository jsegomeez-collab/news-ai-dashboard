import { NextRequest, NextResponse } from "next/server";
import { generateNow } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Generación manual bajo demanda (botón "Guionizar" en una noticia).
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { articleId?: number };
  if (!body.articleId) {
    return NextResponse.json({ error: "articleId requerido" }, { status: 400 });
  }
  const result = await generateNow(Number(body.articleId));
  return NextResponse.json(result);
}
