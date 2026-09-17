import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { transcribePendingVideos } from "@/lib/whisper";
import { processAnalysingVideos } from "@/lib/competitor-generate";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/competitors/run
// body: { mode: "transcribe" | "full" }
//   transcribe → transcribe todos los pending + mueve a analysing
//   full       → transcribe + analiza + genera guiones adaptados (pipeline completo)
export async function POST(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { mode } = await readJsonBody<{ mode?: string }>(req);
  if (!mode || !["transcribe", "full"].includes(mode)) {
    return NextResponse.json({ error: "mode debe ser 'transcribe' o 'full'" }, { status: 400 });
  }

  // Contar cuántos hay en cada estado antes de empezar (solo de este usuario).
  const pending = (db
    .prepare(`SELECT COUNT(*) as n FROM competitor_videos cv
              JOIN competitor_accounts ca ON ca.id = cv.account_id
              WHERE ca.user_id = ? AND cv.status = 'pending'`)
    .get(user.id) as { n: number }).n;
  const analysing = (db
    .prepare(`SELECT COUNT(*) as n FROM competitor_videos cv
              JOIN competitor_accounts ca ON ca.id = cv.account_id
              WHERE ca.user_id = ? AND cv.status = 'analysing'`)
    .get(user.id) as { n: number }).n;

  const result: Record<string, unknown> = { ok: true, mode };

  // Fase 1: transcribir pendientes DE ESTE USUARIO (hasta 8 por llamada para no
  // agotar el timeout). Sin el userId, esto procesaría también los videos
  // pendientes de CUALQUIER otro usuario, gastando su presupuesto/claves.
  const transcribeResult = await transcribePendingVideos(8, user.id);
  result.transcribed = transcribeResult.processed;
  result.transcribeErrors = transcribeResult.errors;
  result.noKey = transcribeResult.noKey > 0;

  // Fase 2 (solo mode "full"): analizar transcritos + generar guiones adaptados,
  // también acotado a este usuario.
  if (mode === "full") {
    const analyseResult = await processAnalysingVideos(10, user.id);
    result.analysed = analyseResult.processed;
    result.analyseErrors = analyseResult.errors;
    // ¡OJO! "analysed" es cuántos videos completaron el ANÁLISIS, no cuántos
    // guiones se generaron — un video se puede analizar bien y aun así
    // quedarse sin guion si la fase de generación falla para todos sus
    // formatos. Antes esto se mostraba (mal) como "guiones generados".
    result.scriptsGenerated = analyseResult.scriptsGenerated;
    result.noScriptCount = analyseResult.noScriptCount;
  }

  const noScriptWarning =
    mode === "full" && (result.noScriptCount as number) > 0
      ? ` ⚠ ${result.noScriptCount} video(s) analizados sin generar guion — revisa tu clave de Anthropic y los formatos activos en Ajustes.`
      : "";

  result.summary = mode === "full"
    ? `${pending} pendientes, ${analysing} en análisis → ${result.transcribed} transcritos, ${result.analysed ?? 0} analizados, ${result.scriptsGenerated ?? 0} guiones generados.${noScriptWarning}`
    : `${pending} pendientes → ${result.transcribed} transcritos`;

  return NextResponse.json(result);
}
