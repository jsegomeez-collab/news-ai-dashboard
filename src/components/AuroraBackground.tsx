// Fondo ambiental del branding: azul marino profundo con resplandores azules
// difuminados (solo azul — es una única familia de color) y una viñeta hacia
// los bordes, detrás de todo el contenido. El drift es lento y se desactiva
// con prefers-reduced-motion (ver globals.css).
export function AuroraBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-ink">
      <div className="animate-aurora absolute -left-48 -top-48 h-[40rem] w-[40rem] rounded-full bg-brand/25 blur-[130px]" />
      <div
        className="animate-aurora absolute -right-40 top-1/4 h-[32rem] w-[32rem] rounded-full bg-brand2/15 blur-[130px]"
        style={{ animationDelay: "-10s" }}
      />
      <div
        className="animate-aurora absolute -bottom-52 left-1/3 h-[30rem] w-[30rem] rounded-full bg-glow/10 blur-[140px]"
        style={{ animationDelay: "-20s" }}
      />
      {/* Viñeta: oscurece los bordes para que las tarjetas de cristal destaquen en el centro. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_40%,rgba(3,10,34,0)_0%,rgba(2,6,26,0.75)_100%)]" />
    </div>
  );
}
