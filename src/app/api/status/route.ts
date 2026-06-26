import { NextRequest, NextResponse } from "next/server";
import { budgetState } from "@/lib/budget";
import { stats } from "@/lib/queries";
import { getBrandDocs } from "@/lib/brand";
import { readUserSettings, withinGenerationWindow } from "@/lib/settings";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const s = readUserSettings(user.id);
  const docs = getBrandDocs(user.id);
  const hasBases = ["problema", "cliente-ideal", "oferta"].some((k) => (docs[k] ?? "").trim());

  return NextResponse.json({
    user,
    hasKey: s.anthropicKey.startsWith("sk-ant-"),
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
