import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { pollCompetitorAccounts } from "@/lib/competitor-pipeline";
import { accountsDue } from "@/lib/competitor";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Disparo manual del descubrimiento de videos de competencia.
// Comprueba solo las cuentas activas (sin forzar las que aún no toca).
export async function POST(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // Cuántas cuentas del usuario están programadas para revisarse ahora.
  const due = accountsDue().filter((a) => a.user_id === user.id);
  if (due.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "No hay cuentas que revisar ahora (respeta el intervalo configurado).",
      checked: 0,
      inserted: 0,
    });
  }

  const result = await pollCompetitorAccounts();
  return NextResponse.json({
    ok: true,
    ...result,
    message: result.available
      ? `${result.checked} cuenta(s) revisadas, ${result.inserted} videos nuevos encontrados.`
      : "yt-dlp no está instalado. Instálalo para activar el descubrimiento automático.",
  });
}
