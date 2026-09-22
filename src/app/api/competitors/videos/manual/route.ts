import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { addManualVideos } from "@/lib/competitor";
import { readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";

// Pega uno o varios enlaces de vídeo sueltos (uno por línea, o separados por
// espacios/comas) y los mete directos a la cola de transcripción, sin hace
// falta que sean de una cuenta que ya monitorices ni pasar por Apify/yt-dlp
// para "descubrirlos" — ya sabes exactamente cuáles quieres.
export async function POST(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { text } = await readJsonBody<{ text?: string }>(req);
  const urls = (text ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (urls.length === 0) return NextResponse.json({ error: "Pega al menos un enlace" }, { status: 400 });

  const result = addManualVideos(user.id, urls);
  const parts = [`${result.added} añadido(s)`];
  if (result.skipped > 0) parts.push(`${result.skipped} ya existían`);
  if (result.invalid > 0) parts.push(`${result.invalid} enlace(s) no reconocidos (solo Instagram/TikTok/YouTube)`);

  return NextResponse.json({ ok: true, ...result, total: urls.length, message: parts.join(" · ") });
}
