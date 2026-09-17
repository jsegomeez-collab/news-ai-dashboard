import type { NextRequest } from "next/server";

// Lee el body JSON de una request de forma segura: nunca lanza, y un body
// vacío / inválido / literal `null` siempre resuelve a un objeto vacío en vez
// de `null` (evita TypeError al desestructurar/acceder a campos en cada ruta).
export async function readJsonBody<T extends object>(req: NextRequest): Promise<T> {
  const body = await req.json().catch(() => null);
  return (body ?? {}) as T;
}

// Parsea un entero de un query param con límites y valor por defecto seguro
// ante NaN (evita "datatype mismatch" al bindear NaN en LIMIT/OFFSET de SQLite,
// o resultados vacíos silenciosos al bindear NaN en comparaciones WHERE).
export function parseIntParam(value: string | null, fallback: number, min: number, max: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
