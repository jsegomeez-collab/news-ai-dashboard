import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { pollCompetitorAccounts } from "@/lib/competitor-pipeline";
import { accountsDue } from "@/lib/competitor";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Disparo manual del descubrimiento de videos de competencia.
// Comprueba solo las cuentas activas de ESTE usuario (sin forzar las que aún
// no toca, y sin tocar cuentas de otros usuarios como efecto colateral).
export async function POST(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const due = accountsDue(user.id);
  if (due.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "No hay cuentas que revisar ahora (respeta el intervalo configurado).",
      checked: 0,
      inserted: 0,
    });
  }

  const result = await pollCompetitorAccounts(user.id);
  return NextResponse.json({
    ok: true,
    ...result,
    message:
      result.unavailable.length > 0
        ? `${result.checked} cuenta(s) revisadas, ${result.inserted} videos nuevos. Faltan dependencias: ${result.unavailable.join(", ")}.`
        : `${result.checked} cuenta(s) revisadas, ${result.inserted} videos nuevos encontrados.`,
  });
}
