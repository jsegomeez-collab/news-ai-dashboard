import { NextRequest, NextResponse } from "next/server";
import { generateNow } from "@/lib/pipeline";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { articleId?: number };
  if (!body.articleId) return NextResponse.json({ error: "articleId requerido" }, { status: 400 });

  const result = await generateNow(user.id, Number(body.articleId));
  return NextResponse.json(result);
}
