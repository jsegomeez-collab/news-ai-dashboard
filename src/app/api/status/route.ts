import { NextRequest, NextResponse } from "next/server";
import { budgetState } from "@/lib/budget";
import { stats } from "@/lib/queries";
import { getBrandDocs } from "@/lib/brand";
import { readUserSettings, withinGenerationWindow } from "@/lib/settings";
import { getUser } from "@/lib/auth";
import { dbInfo } from "@/lib/db";
import { readHeartbeat } from "@/lib/heartbeat";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const s = readUserSettings(user.id);
  const docs = getBrandDocs(user.id);
  const hasBases = ["problema", "cliente-ideal", "oferta"].some((k) => (docs[k] ?? "").trim());

  const heartbeat = readHeartbeat();
  // La edad se calcula aquí, en el servidor, en vez de que el cliente reste su
  // propio Date.now() contra el timestamp — así un reloj de sistema desajustado
  // en el navegador del usuario no puede pintar el worker como sano o parado
  // cuando no lo está.
  const worker = heartbeat
    ? { ...heartbeat, ageSeconds: Math.floor((Date.now() - new Date(heartbeat.lastRunAt).getTime()) / 1000) }
    : null;

  return NextResponse.json({
    user,
    hasKey: s.anthropicKey.startsWith("sk-ant-"),
    db: dbInfo(),
    worker,
    budget: budgetState(user.id),
    stats: stats(user.id),
    knowledge: { hasBases, hasTono: !!(docs["tonalidad"] ?? "").trim() },
    window: { active: withinGenerationWindow(s), minutes: s.windowMinutes, intervalHours: s.windowIntervalHours },
    config: {
      genModel: s.genModel,
      autoGenerate: s.autoGenerate,
      genRelevanceThreshold: s.genRelevanceThreshold,
      formats: s.formats,
    },
  });
}
