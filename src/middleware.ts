import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "sid";

// Páginas y rutas públicas (no requieren sesión).
function isPublic(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/register" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  );
}

// El middleware (Edge) solo comprueba la PRESENCIA de la cookie; la validación
// real contra la BD la hacen las rutas con getUser(). Si la cookie es inválida,
// /api/auth/me devuelve 401 y el cliente redirige a /login.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const hasSession = !!req.cookies.get(SESSION_COOKIE)?.value;
  if (hasSession) return NextResponse.next();

  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
