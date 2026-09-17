import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { listAccounts, createAccount, isValidAccountUrl } from "@/lib/competitor";
import { readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  return NextResponse.json({ accounts: listAccounts(user.id) });
}

export async function POST(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await readJsonBody<{
    platform?: string;
    handle?: string;
    url?: string;
    display_name?: string;
    min_views?: number;
    min_likes?: number;
    min_comments?: number;
    check_interval_hours?: number;
  }>(req);

  const PLATFORMS = ["instagram", "tiktok", "youtube"];
  if (!body.platform || !PLATFORMS.includes(body.platform)) {
    return NextResponse.json({ error: "Plataforma inválida (instagram, tiktok, youtube)" }, { status: 400 });
  }
  if (!body.handle?.trim()) return NextResponse.json({ error: "Falta el handle" }, { status: 400 });
  if (!body.url?.trim()) return NextResponse.json({ error: "Falta la URL del perfil" }, { status: 400 });
  if (!isValidAccountUrl(body.platform, body.url)) {
    return NextResponse.json({ error: `La URL debe ser un enlace real de ${body.platform}` }, { status: 400 });
  }

  try {
    const id = createAccount(user.id, body as Required<typeof body>);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (msg.includes("UNIQUE")) return NextResponse.json({ error: "Ya tienes esa cuenta añadida" }, { status: 409 });
    console.warn("[competitors] error al crear cuenta:", msg);
    return NextResponse.json({ error: "No se pudo crear la cuenta" }, { status: 500 });
  }
}
