import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { listFolders, listFiles, folderBreadcrumb, getFolder } from "@/lib/drive";

export const dynamic = "force-dynamic";

// Contenido de una carpeta (o de la raíz si no se pasa folderId): subcarpetas,
// archivos, y la miga de pan para poder navegar.
export function GET(req: NextRequest) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const raw = req.nextUrl.searchParams.get("folderId");
  const folderId = raw ? Number(raw) : null;
  if (folderId !== null) {
    if (!Number.isFinite(folderId) || !getFolder(user.id, folderId)) {
      return NextResponse.json({ error: "Carpeta no encontrada" }, { status: 404 });
    }
  }

  return NextResponse.json({
    folderId,
    breadcrumb: folderBreadcrumb(user.id, folderId),
    folders: listFolders(user.id, folderId),
    files: listFiles(user.id, folderId),
  });
}
