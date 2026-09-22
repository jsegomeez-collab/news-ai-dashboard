// Vive aquí (no en drive.ts) para que las páginas cliente puedan importarlo
// sin arrastrar drive.ts al bundle del navegador (drive.ts importa ./db, que
// usa node:sqlite y solo puede correr en el servidor).
export const DRIVE_STATUSES = ["por_grabar", "editando", "por_subir", "subido"] as const;
export type DriveStatus = (typeof DRIVE_STATUSES)[number];

export const DRIVE_STATUS_LABEL: Record<string, string> = {
  por_grabar: "Por grabar",
  editando: "Editando",
  por_subir: "Por subir",
  subido: "Subido",
};

export function driveKindIcon(kind: string): string {
  return kind === "video" ? "🎬" : "🎙️";
}

export function fmtBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)}GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${n}B`;
}
