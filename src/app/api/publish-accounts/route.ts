import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { listPublishAccounts, createPublishAccount, type PublishNetwork } from "@/lib/publishAccounts";
import { readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";

const NETWORKS: PublishNetwork[] = ["instagram", "tiktok", "youtube"];

export function GET(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  return NextResponse.json({ accounts: listPublishAccounts(user.id) });
}

export async function POST(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await readJsonBody<{ blogId?: string; label?: string; network?: string }>(req);
  if (!body.blogId?.trim() || !body.label?.trim()) {
    return NextResponse.json({ error: "Faltan blogId o etiqueta" }, { status: 400 });
  }
  if (!body.network || !NETWORKS.includes(body.network as PublishNetwork)) {
    return NextResponse.json({ error: "Red inválida" }, { status: 400 });
  }

  const id = createPublishAccount(user.id, {
    blogId: body.blogId,
    label: body.label,
    network: body.network as PublishNetwork,
  });
  return NextResponse.json({ ok: true, id });
}
