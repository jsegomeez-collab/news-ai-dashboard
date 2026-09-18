import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { linkTargetOwnedBy } from "@/lib/contentItems";
import { getRender, queueAvatarVideo, type SourceType } from "@/lib/heygen-generate";
import { readJsonBody } from "@/lib/http";

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

// Botón manual "Generar vídeo con avatar" / "Reintentar" por guion — arranca
// el pipeline (HeyGen -> Whisper+Remotion) sin esperar a que el guion esté
// 'aprobado' ni al ciclo automático del worker. Respeta igualmente el tope
// de gasto diario y la idempotencia de queueAvatarVideo (no relanza si ya
// hay un render en curso o completado).
export async function POST(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await readJsonBody<{ type?: string; id?: number }>(req);
  const type = parseType(body.type ?? null);
  const id = Number(body.id);
  if (!type || !Number.isFinite(id)) return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  if (!linkTargetOwnedBy(user.id, type, id)) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const result = await queueAvatarVideo(user.id, type, id);
  return NextResponse.json(result);
}
