import { NextRequest, NextResponse } from "next/server";
import { listNews } from "@/lib/queries";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const minParam = req.nextUrl.searchParams.get("min");
  const min = minParam !== null ? Number(minParam) : env.newsMinRelevance;
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "100");
  return NextResponse.json({ items: listNews({ minRelevance: min, limit }) });
}
