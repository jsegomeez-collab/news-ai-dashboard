import { NextRequest, NextResponse } from "next/server";
import { listScripts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const min = Number(req.nextUrl.searchParams.get("min") ?? "0");
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "100");
  return NextResponse.json({ items: listScripts({ minScore: min, limit }) });
}
