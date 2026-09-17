import { NextRequest, NextResponse } from "next/server";
import { createUser, emailExists, createSession } from "@/lib/auth";
import { setSessionCookie } from "@/lib/cookies";
import { readJsonBody } from "@/lib/http";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const b = await readJsonBody<{ email?: string; name?: string; password?: string }>(req);
  const email = (b.email ?? "").trim().toLowerCase();
  const password = b.password ?? "";

  // Sin esto, un script podía crear cuentas sin límite (no hay verificación
  // de email ni CAPTCHA) — un tope por IP basta para frenar el abuso masivo.
  const rl = checkRateLimit(`register:${clientIp(req)}`, 5, 60 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Demasiadas cuentas creadas desde aquí. Prueba de nuevo más tarde." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

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
