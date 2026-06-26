import { NextRequest, NextResponse } from "next/server";
import { runUserCycle } from "@/lib/pipeline";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// "Actualizar ahora": trae noticias (global) y clasifica/genera para este usuario.
export async function POST(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const result = await runUserCycle(user.id);
  return NextResponse.json(result);
}
