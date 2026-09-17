/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3: mismo motivo de siempre (node:sqlite nativo). Los de
  // Remotion: @remotion/bundler usa esbuild/@rspack internamente (binarios
  // nativos) — si next build intenta empaquetarlos con SU webpack, revienta
  // igual que node:sqlite lo haría sin el hueco de abajo.
  serverExternalPackages: ["better-sqlite3", "@remotion/bundler", "@remotion/renderer", "@remotion/captions"],
  webpack: (config) => {
    // node:sqlite es un built-in de Node.js 22+ — hay que externalizarlo manualmente.
    config.externals = [...(config.externals ?? []), { "node:sqlite": "node:sqlite" }];
    return config;
  },
  // Cabeceras de seguridad básicas en todas las respuestas. Se queda fuera
  // deliberadamente una Content-Security-Policy estricta: con reproductores
  // de audio/video, blobs y varias páginas nuevas (Drive, Calendario...) sin
  // una pasada completa de pruebas por página, un CSP mal ajustado rompería
  // la app en producción — mejor añadirlo aparte, probado a fondo.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
