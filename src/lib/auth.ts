import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "./db";
import { isAdminEmail } from "./env";

export const SESSION_COOKIE = "sid";
const SESSION_DAYS = 30;

export type User = { id: number; email: string; name: string | null; isAdmin: boolean };

function toUser(row: { id: number; email: string; name: string | null }): User {
  return { id: row.id, email: row.email, name: row.name, isAdmin: isAdminEmail(row.email) };
}

// ---- Hash de contraseña (scrypt nativo, sin dependencias externas) ----
function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(pw, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function ensureSettings(userId: number): void {
  db.prepare(
    `INSERT INTO user_settings(user_id, updated_at) VALUES(?, ?)
     ON CONFLICT(user_id) DO NOTHING`
  ).run(userId, new Date().toISOString());
}

// ---- Usuarios ----
export function emailExists(email: string): boolean {
  return !!db.prepare(`SELECT 1 FROM users WHERE email = ?`).get(email.toLowerCase());
}

export function createUser(email: string, name: string, password: string): User {
  const e = email.trim().toLowerCase();
  const res = db
    .prepare(`INSERT INTO users(email, name, password_hash, created_at) VALUES(?, ?, ?, ?)`)
    .run(e, name.trim() || null, hashPassword(password), new Date().toISOString());
  const id = Number(res.lastInsertRowid);
  ensureSettings(id);
  return toUser({ id, email: e, name: name.trim() || null });
}

export function authenticate(email: string, password: string): User | null {
  const row = db
    .prepare(`SELECT id, email, name, password_hash FROM users WHERE email = ?`)
    .get(email.trim().toLowerCase()) as
    | { id: number; email: string; name: string | null; password_hash: string }
    | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  ensureSettings(row.id);
  return toUser(row);
}

// ---- Sesiones ----
export function createSession(userId: number): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86400_000);
  db.prepare(
    `INSERT INTO sessions(token, user_id, created_at, expires_at) VALUES(?, ?, ?, ?)`
  ).run(token, userId, now.toISOString(), expiresAt.toISOString());
  return { token, expiresAt };
}

export function deleteSession(token: string): void {
  db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

export function userFromToken(token: string | undefined): User | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.name, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .get(token) as { id: number; email: string; name: string | null; expires_at: string } | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    deleteSession(token);
    return null;
  }
  return toUser(row);
}

// Lee el usuario actual desde la cookie de la petición. Devuelve null si no hay sesión.
export function getUser(req: NextRequest): User | null {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return userFromToken(token);
}

export const SESSION_MAX_AGE = SESSION_DAYS * 86400;
