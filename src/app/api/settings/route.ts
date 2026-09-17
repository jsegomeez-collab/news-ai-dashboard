import { NextRequest, NextResponse } from "next/server";
import { readUserSettings, writeUserSettings, toSafeSettings, GEN_MODEL_OPTIONS, type UserSettings } from "@/lib/settings";
import { getUser } from "@/lib/auth";
import { readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  return NextResponse.json({ settings: toSafeSettings(readUserSettings(user.id)), modelOptions: GEN_MODEL_OPTIONS });
}

export async function POST(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const patch = await readJsonBody<Partial<UserSettings>>(req);
  return NextResponse.json({ ok: true, settings: toSafeSettings(writeUserSettings(user.id, patch)) });
}
