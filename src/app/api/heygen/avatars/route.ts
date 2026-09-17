import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { readUserSettings } from "@/lib/settings";
import { listAvatars } from "@/lib/heygen";

export const dynamic = "force-dynamic";

// Se llama bajo demanda (botón "Cargar mis avatares" en Ajustes), no en cada
// carga de la página — es una llamada a la API de HeyGen con la clave del
// usuario, no algo que quieras disparar de fondo sin que lo pida.
export async function GET(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const settings = readUserSettings(user.id);
  if (!settings.heygenKey) return NextResponse.json({ error: "Configura antes tu clave de HeyGen." }, { status: 400 });

  try {
    const avatars = await listAvatars(settings.heygenKey);
    return NextResponse.json({ avatars });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
