import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { adminOverview } from "@/lib/admin";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  return NextResponse.json(adminOverview());
}
