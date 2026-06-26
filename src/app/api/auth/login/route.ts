import { NextRequest, NextResponse } from "next/server";
import { authenticate, createSession } from "@/lib/auth";
import { setSessionCookie } from "@/lib/cookies";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const user = authenticate(b.email ?? "", b.password ?? "");
  if (!user) {
    return NextResponse.json({ error: "Email o contraseña incorrectos" }, { status: 401 });
  }
  const { token } = createSession(user.id);
  const res = NextResponse.json({ user });
  setSessionCookie(res, token);
  return res;
}
