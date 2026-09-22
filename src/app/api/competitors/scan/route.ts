import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getOrCreateScanAccount, clampScanLimit } from "@/lib/competitor";
import { scanProfileOnce } from "@/lib/competitor-pipeline";
import { readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PLATFORMS = ["instagram", "tiktok", "youtube"];

// Escaneo PUNTUAL de un perfil: mismos filtros que "añadir cuenta a espiar"
// (vistas/likes/comentarios), pero de una sola vez, sin dejarlo guardado como
// cuenta monitorizada para siempre — para "quiero ver qué hay en este perfil
// AHORA con estos filtros" sin tener que darlo de alta ni borrarlo después.
export async function POST(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await readJsonBody<{
    platform?: string;
    handle?: string;
    url?: string;
    min_views?: number;
    min_likes?: number;
    min_comments?: number;
    scan_limit?: number;
  }>(req);

  const platform = body.platform ?? "";
  if (!PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: "platform debe ser instagram, tiktok o youtube" }, { status: 400 });
  }
  const handle = (body.handle ?? "").trim();
  const url = (body.url ?? "").trim();
  if (!handle || !url) return NextResponse.json({ error: "Faltan handle y/o url" }, { status: 400 });

  const thresholds = {
    min_views: Math.max(0, body.min_views ?? 50000),
    min_likes: Math.max(0, body.min_likes ?? 0),
    min_comments: Math.max(0, body.min_comments ?? 300),
  };

  const scanLimit = clampScanLimit(body.scan_limit);

  try {
    const accountId = getOrCreateScanAccount(user.id, platform, handle, url);
    const result = await scanProfileOnce(accountId, user.id, platform, handle, url, thresholds, scanLimit);

    const message =
      result.unavailable === "apify"
        ? "Instagram requiere tu token de Apify (Ajustes → Instagram)."
        : result.unavailable === "yt-dlp"
          ? "yt-dlp no está instalado en el servidor, hace falta para TikTok/YouTube."
          : `${result.fetched} vídeo(s) vistos → ${result.inserted} nuevos tras el filtro, ${result.skipped} omitidos.`;

    return NextResponse.json({ ok: true, ...result, message });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
