import { NextRequest, NextResponse } from "next/server";
import { createUser, emailExists, createSession } from "@/lib/auth";
import { setSessionCookie } from "@/lib/cookies";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { email?: string; name?: string; password?: string };
  const email = (b.email ?? "").trim().toLowerCase();
  const password = b.password ?? "";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Email no válido" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
  }
  if (emailExists(email)) {
    return NextResponse.json({ error: "Ya existe una cuenta con ese email" }, { status: 400 });
  }

  const user = createUser(email, b.name ?? "", password);
  const { token } = createSession(user.id);
  const res = NextResponse.json({ user });
  setSessionCookie(res, token);
  return res;
}
