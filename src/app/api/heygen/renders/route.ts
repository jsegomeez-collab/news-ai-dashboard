import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { linkTargetOwnedBy } from "@/lib/contentItems";
import { getRender, type SourceType } from "@/lib/heygen-generate";

export const dynamic = "force-dynamic";

function parseType(v: string | null): SourceType | null {
  return v === "script" || v === "competitor_script" ? v : null;
}

// Estado del render de HeyGen de UN guion concreto (para pintar el badge
// "generando…"/"listo"/"error" en /guiones y /adaptados).
export async function GET(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const type = parseType(req.nextUrl.searchParams.get("type"));
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!type || !Number.isFinite(id)) return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  if (!linkTargetOwnedBy(user.id, type, id)) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const render = getRender(user.id, type, id);
  return NextResponse.json({ render });
}
