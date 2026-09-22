import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { deleteUserAccount } from "@/lib/admin";
import { writeUserSettings } from "@/lib/settings";
import { readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";

// Topes que el admin puede ajustar por cuenta desde el panel — el mismo
// subconjunto de user_settings que cada usuario ya podría tocarse a sí mismo
// en Ajustes, para poder frenar el gasto de una cuenta sin depender de que
// lo haga ella misma.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getUser(req);
  if (!admin) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!admin.isAdmin) return NextResponse.json({ error: "Solo administradores" }, { status: 403 });

  const { id } = await params;
  const targetId = Number(id);
  if (!Number.isFinite(targetId)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const body = await readJsonBody<{
    maxScriptsPerDay?: number;
    maxDailyUsd?: number;
    competitorAdaptLimit?: number;
    heygenDailyUsdCap?: number;
  }>(req);

  try {
    writeUserSettings(targetId, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

// Borra la cuenta de un usuario entera (guiones, competencia, HeyGen, Drive,
// Calendario, ajustes...) y sus archivos físicos. Irreversible.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getUser(req);
  if (!admin) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!admin.isAdmin) return NextResponse.json({ error: "Solo administradores" }, { status: 403 });

  const { id } = await params;
  const targetId = Number(id);
  if (!Number.isFinite(targetId)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  if (targetId === admin.id) {
    return NextResponse.json({ error: "No puedes eliminar tu propia cuenta de admin desde aquí" }, { status: 400 });
  }

  deleteUserAccount(targetId);
  return NextResponse.json({ ok: true });
}
