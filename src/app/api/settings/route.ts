import { NextRequest, NextResponse } from "next/server";
import { readSettings, writeSettings, GEN_MODEL_OPTIONS, type EditableSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ settings: readSettings(), modelOptions: GEN_MODEL_OPTIONS });
}

export async function POST(req: NextRequest) {
  const patch = (await req.json().catch(() => ({}))) as Partial<EditableSettings>;
  const next = writeSettings(patch);
  return NextResponse.json({ ok: true, settings: next });
}
