import { NextResponse } from "next/server";
import { runCycle } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
// Permite disparar un ciclo manual desde el dashboard (botón "Actualizar ahora").
export const maxDuration = 300;

export async function POST() {
  const result = await runCycle();
  return NextResponse.json(result);
}
