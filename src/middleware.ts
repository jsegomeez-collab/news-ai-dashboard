import { NextRequest, NextResponse } from "next/server";

// Protección de acceso por contraseña (HTTP Basic Auth) para TODO el dashboard
// y las APIs. Se activa solo si DASHBOARD_PASSWORD está definida; si no, la app
// queda abierta (cómodo en local). En producción, define DASHBOARD_PASSWORD.
export function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();

  const user = process.env.DASHBOARD_USER || "admin";
  const header = req.headers.get("authorization");

  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const idx = decoded.indexOf(":");
      const u = decoded.slice(0, idx);
      const p = decoded.slice(idx + 1);
      if (u === user && p === password) return NextResponse.next();
    } catch {
      /* cabecera malformada */
    }
  }

  return new NextResponse("Acceso restringido. Introduce usuario y contraseña.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="AI Actualidad", charset="UTF-8"' },
  });
}

export const config = {
  // Protege todo excepto los assets estáticos de Next.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
