import { NextRequest, NextResponse } from "next/server";
import { runVideoPipelineForUser } from "@/lib/pipeline";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// "Proceso 2", disparado a mano: para los vídeos que el usuario YA arrancó
// (botón/selección múltiple en /guiones y /adaptados), comprueba si HeyGen
// terminó, edita con Whisper+Remotion y publica en Metricool lo que quede
// listo. Deliberadamente fuera del ciclo automático del worker — ver
// runVideoPipelineForUser en pipeline.ts.
export async function POST(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const result = await runVideoPipelineForUser(user.id);
  return NextResponse.json(result);
}
