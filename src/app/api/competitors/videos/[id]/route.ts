import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getVideo } from "@/lib/competitor";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  return params.then(({ id }) => {
    const video = getVideo(user.id, Number(id));
    if (!video) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ video });
  });
}
