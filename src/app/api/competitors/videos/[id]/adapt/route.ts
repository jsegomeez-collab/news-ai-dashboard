import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getVideo } from "@/lib/competitor";
import { analyseAndAdapt } from "@/lib/competitor-generate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;

  const video = getVideo(user.id, Number(id));
  if (!video) return NextResponse.json({ error: "Video no encontrado" }, { status: 404 });
  if (!video.transcript) return NextResponse.json({ error: "Sin transcripción disponible. El video debe estar transcrito primero." }, { status: 400 });
  if (!["analysing", "done"].includes(video.status)) {
    return NextResponse.json({ error: `El video está en estado '${video.status}'. Debe estar transcrito primero.` }, { status: 400 });
  }

  const result = await analyseAndAdapt(user.id, Number(id));
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
