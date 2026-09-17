// Construye el texto de un guion como UN solo bloque legible (con saltos de
// párrafo entre gancho/puente/cuerpo/CTA) en vez de fragmentos separados en
// cajas de colores — así se lee de corrido, como el guion que realmente vas
// a grabar, no como un formulario con campos.
export function buildScriptText(s: {
  hook?: string | null;
  puente?: string | null;
  body?: string | null;
  cta?: string | null;
}): string {
  const parts = [s.hook, s.puente, s.body].filter((p): p is string => !!p?.trim());
  let text = parts.join("\n\n");
  if (s.cta?.trim()) text += (text ? "\n\n" : "") + s.cta.trim();
  return text;
}
