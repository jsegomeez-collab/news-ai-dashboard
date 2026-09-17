import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { listCalendarItems } from "@/lib/calendar";

export const dynamic = "force-dynamic";

// ?month=YYYY-MM — devuelve todo lo programado/publicado ese mes.
export function GET(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const monthParam = req.nextUrl.searchParams.get("month") ?? "";
  const match = /^(\d{4})-(\d{2})$/.exec(monthParam);
  const now = new Date();
  const year = match ? Number(match[1]) : now.getUTCFullYear();
  const month = match ? Number(match[2]) - 1 : now.getUTCMonth();

  const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const nextMonthDate = new Date(Date.UTC(year, month + 1, 1));
  const to = nextMonthDate.toISOString().slice(0, 10);

  return NextResponse.json({ from, to, items: listCalendarItems(user.id, from, to) });
}
