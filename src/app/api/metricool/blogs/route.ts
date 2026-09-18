import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { readUserSettings } from "@/lib/settings";
import { listBlogs } from "@/lib/metricool";

export const dynamic = "force-dynamic";

// Se llama bajo demanda (botón "Cargar mis cuentas" en Ajustes) para que el
// usuario elija el blogId de cada cuenta destino sin ir a buscarlo a mano.
export async function GET(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const settings = readUserSettings(user.id);
  if (!settings.metricoolUserToken) {
    return NextResponse.json({ error: "Configura antes tu token de Metricool." }, { status: 400 });
  }

  try {
    const blogs = await listBlogs(settings.metricoolUserToken);
    return NextResponse.json({ blogs });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
