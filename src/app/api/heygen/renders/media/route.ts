import { NextRequest, NextResponse } from "next/server";
import { createReadStream, existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { getUser } from "@/lib/auth";
import { linkTargetOwnedBy } from "@/lib/contentItems";
import { getRender, type SourceType } from "@/lib/heygen-generate";
import { safeMediaContentType } from "@/lib/uploads";

export const dynamic = "force-dynamic";

function parseType(v: string | null): SourceType | null {
  return v === "script" || v === "competitor_script" ? v : null;
}

// Sirve el mp4 generado por HeyGen — mismo soporte de Range que
// /api/competitors/scripts/[id]/media para permitir seek en el reproductor,
// y mismo saneado de Content-Type que el resto de archivos subidos/generados
// (nunca se sirve inline si el tipo guardado no está en la lista blanca).
export async function GET(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const type = parseType(req.nextUrl.searchParams.get("type"));
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!type || !Number.isFinite(id)) return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  if (!linkTargetOwnedBy(user.id, type, id)) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const render = getRender(user.id, type, id);
  if (!render?.video_path || !existsSync(render.video_path)) {
    return NextResponse.json({ error: "Sin vídeo todavía" }, { status: 404 });
  }

  const stat = statSync(render.video_path);
  const { contentType, inline } = safeMediaContentType("video/mp4");
  const disposition = `${inline ? "inline" : "attachment"}; filename="video.mp4"`;
  const range = req.headers.get("range");

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match?.[1] ? parseInt(match[1], 10) : 0;
    const end = match?.[2] ? parseInt(match[2], 10) : stat.size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= stat.size) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    }
    const nodeStream = createReadStream(render.video_path, { start, end });
    return new NextResponse(Readable.toWeb(nodeStream) as unknown as ReadableStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Content-Type": contentType,
        "Content-Disposition": disposition,
      },
    });
  }

  const nodeStream = createReadStream(render.video_path);
  return new NextResponse(Readable.toWeb(nodeStream) as unknown as ReadableStream, {
    headers: {
      "Content-Length": String(stat.size),
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Content-Disposition": disposition,
    },
  });
}
