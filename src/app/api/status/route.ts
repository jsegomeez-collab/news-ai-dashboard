import { NextResponse } from "next/server";
import { budgetState } from "@/lib/budget";
import { stats } from "@/lib/queries";
import { loadKnowledge } from "@/lib/knowledge";
import { getBrandDocs } from "@/lib/brand";
import { env, hasApiKey } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  let knowledge = { fileCount: 0, hasBases: false, hasTono: false };
  try {
    const k = await loadKnowledge();
    const docs = getBrandDocs();
    const dbBases = ["problema", "cliente-ideal", "oferta"].some((kk) => (docs[kk] ?? "").trim());
    knowledge = {
      fileCount: k.fileCount,
      hasBases: k.basesNegocio.length > 0 || dbBases,
      hasTono: k.tonalidad.length > 0 || !!(docs["tonalidad"] ?? "").trim(),
    };
  } catch {
    /* knowledge vacío */
  }

  return NextResponse.json({
    apiKey: hasApiKey(),
    budget: budgetState(),
    stats: stats(),
    knowledge,
    config: {
      modelClassify: env.modelClassify,
      modelGenerate: env.modelGenerate,
      relevanceThreshold: env.relevanceThreshold,
      formats: env.generateFormats,
      useBatchClassify: env.useBatchClassify,
      pollCron: env.pollCron,
      twitterEnabled: env.twitterEnabled,
    },
  });
}
