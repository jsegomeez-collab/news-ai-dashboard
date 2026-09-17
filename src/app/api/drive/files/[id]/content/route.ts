import { NextRequest, NextResponse } from "next/server";
import { createReadStream, existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { getUser } from "@/lib/auth";
import { getFile } from "@/lib/drive";
import { safeMediaContentType } from "@/lib/uploads";

export const dynamic = "force-dynamic";

function safeFilename(name: string): string {
  return name.replace(/["\r\n]/g, "").slice(0, 200) || "archivo";
}

// Sirve el archivo para reproducirlo/descargarlo, con soporte de Range para
// que el reproductor pueda buscar (seek) sin bajarlo entero.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  const file = getFile(user.id, Number(id));
  if (!file || !existsSync(file.path)) return NextResponse.json({ error: "Sin archivo" }, { status: 404 });

  const stat = statSync(file.path);
  const { contentType, inline } = safeMediaContentType(file.mime);
  const filename = safeFilename(file.original_name);
  const disposition = `${inline ? "inline" : "attachment"}; filename="${filename}"`;
  const range = req.headers.get("range");

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match?.[1] ? parseInt(match[1], 10) : 0;
    const end = match?.[2] ? parseInt(match[2], 10) : stat.size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= stat.size) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    }
    const nodeStream = createReadStream(file.path, { start, end });
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

  const nodeStream = createReadStream(file.path);
  return new NextResponse(Readable.toWeb(nodeStream) as unknown as ReadableStream, {
    headers: {
      "Content-Length": String(stat.size),
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Content-Disposition": disposition,
    },
  });
}
