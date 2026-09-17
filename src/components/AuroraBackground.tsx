// Halo ambiental de fondo: resplandores difuminados fijos detrás de todo el
// contenido (z-index negativo), visibles en los huecos entre tarjetas y en
// los márgenes de la página. El drift es intencionadamente lento y sutil
// (ver globals.css) y se desactiva del todo con prefers-reduced-motion.
export function AuroraBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="animate-aurora absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-brand/25 blur-[120px]" />
      <div
        className="animate-aurora absolute -right-40 top-1/3 h-[30rem] w-[30rem] rounded-full bg-violet-600/20 blur-[120px]"
        style={{ animationDelay: "-10s" }}
      />
      <div
        className="animate-aurora absolute -bottom-48 left-1/4 h-[28rem] w-[28rem] rounded-full bg-brand2/10 blur-[130px]"
        style={{ animationDelay: "-20s" }}
      />
    </div>
  );
}
