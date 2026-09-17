import { NextRequest, NextResponse } from "next/server";
import { authenticate, createSession } from "@/lib/auth";
import { setSessionCookie } from "@/lib/cookies";
import { readJsonBody } from "@/lib/http";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const b = await readJsonBody<{ email?: string; password?: string }>(req);
  const email = (b.email ?? "").trim().toLowerCase();
  const ip = clientIp(req);

  // Dos topes: por IP+email (evita fuerza bruta contra una cuenta concreta) y
  // por IP sola (evita probar contraseñas contra muchos emails a la vez).
  const perAccount = checkRateLimit(`login:${ip}:${email}`, 10, 15 * 60_000);
  const perIp = checkRateLimit(`login-ip:${ip}`, 30, 15 * 60_000);
  if (!perAccount.allowed || !perIp.allowed) {
    const retryAfterSec = Math.max(perAccount.retryAfterSec, perIp.retryAfterSec);
    return NextResponse.json(
      { error: "Demasiados intentos. Prueba de nuevo en unos minutos." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  const user = authenticate(email, b.password ?? "");
  if (!user) {
    return NextResponse.json({ error: "Email o contraseña incorrectos" }, { status: 401 });
  }
  const { token } = createSession(user.id);
  const res = NextResponse.json({ user });
  setSessionCookie(res, token);
  return res;
}
