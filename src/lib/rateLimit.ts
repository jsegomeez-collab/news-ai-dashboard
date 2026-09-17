import type { NextRequest } from "next/server";

// Limitador en memoria: la web corre como proceso Node persistente (no
// serverless), así que un Map compartido entre requests es válido — no hace
// falta Redis para un solo proceso. Protege login (fuerza bruta/credential
// stuffing) y registro (creación masiva de cuentas), que no tenían ningún
// límite: se podía scriptear intentos de contraseña o altas ilimitadas.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Purga periódica para no acumular claves caducadas indefinidamente.
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) if (b.resetAt < now) buckets.delete(key);
}, 5 * 60_000);
cleanupTimer.unref();

export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (b.count >= max) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  b.count++;
  return { allowed: true, retryAfterSec: 0 };
}

// Render (y la mayoría de hosts) ponen la IP real del visitante en
// X-Forwarded-For; en local, sin proxy, no viene y se agrupa todo bajo
// "local" (sigue limitando por email en el login).
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}
