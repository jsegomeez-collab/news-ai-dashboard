import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { readUserSettings } from "@/lib/settings";
import { listVoices } from "@/lib/heygen";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const settings = readUserSettings(user.id);
  if (!settings.heygenKey) return NextResponse.json({ error: "Configura antes tu clave de HeyGen." }, { status: 400 });

  try {
    const voices = await listVoices(settings.heygenKey);
    return NextResponse.json({ voices });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
