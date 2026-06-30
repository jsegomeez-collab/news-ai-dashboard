import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getVideo, pendingVideosWithUser } from "@/lib/competitor";
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

  // pendingVideosWithUser devuelve el tipo completo con platform y media_url.
  const pendingRow = pendingVideosWithUser(200).find((v) => v.id === videoId);
  if (!pendingRow) {
    return NextResponse.json({ error: "Video no encontrado en cola de transcripción." }, { status: 404 });
  }

  const result = await transcribeOneVideo(pendingRow, user.id);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
