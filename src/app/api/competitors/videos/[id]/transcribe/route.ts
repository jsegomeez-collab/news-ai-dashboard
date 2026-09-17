import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getVideo, pendingVideoById } from "@/lib/competitor";
import { transcribeOneVideo } from "@/lib/whisper";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const videoId = Number(id);

  const video = getVideo(user.id, videoId);
  if (!video) return NextResponse.json({ error: "Video no encontrado" }, { status: 404 });
  if (!["pending", "error"].includes(video.status)) {
    return NextResponse.json({ error: `El video está en estado '${video.status}', no se puede transcribir.` }, { status: 400 });
  }

  // Lookup dirigido por id (no la lista global de pendientes, que solo cubre
  // status='pending' y un límite fijo — un video en 'error' o fuera de esa
  // ventana nunca aparecía ahí, dejando el botón "reintentar" siempre en 404).
  const pendingRow = pendingVideoById(user.id, videoId);
  if (!pendingRow) {
    return NextResponse.json({ error: "Video no encontrado en cola de transcripción." }, { status: 404 });
  }

  const result = await transcribeOneVideo(pendingRow, user.id);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
