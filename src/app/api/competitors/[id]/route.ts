import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getAccount, updateAccount, deleteAccount } from "@/lib/competitor";
import { readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  return params.then(({ id }) => {
    const account = getAccount(user.id, Number(id));
    if (!account) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ account });
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  const body = await readJsonBody<{
    active?: boolean;
    display_name?: string;
    min_views?: number;
    min_likes?: number;
    min_comments?: number;
    scan_limit?: number;
    check_interval_hours?: number;
  }>(req);
  updateAccount(user.id, Number(id), body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  deleteAccount(user.id, Number(id));
  return NextResponse.json({ ok: true });
}
