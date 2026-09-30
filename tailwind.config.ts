import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Sistema de color tomado del branding de example.html ("Código
        // MaestrIA"): azul marino profundo como base, superficies de cristal
        // con tinte azul, líneas azules de bajo contraste y un solo acento
        // azul eléctrico (brand) con su versión clara (brand2) para textos
        // y detalles. Nada de naranja/violeta: toda la paleta es una familia.
        ink: "#030a22",        // fondo de página (--cm-bg)
        deep: "#02061a",       // fondo aún más profundo (--cm-bg-deep)
        panel: "#071433",      // superficie de tarjeta (sobre esto va el cristal de globals.css)
        panel2: "#0c2050",     // superficie elevada / hover / activo (--cm-card-hi)
        edge: "#1f4278",       // línea (equivale a rgba(91,156,225,.32) sobre navy)
        edge2: "#4a86d0",      // línea fuerte (--cm-line-strong)
        brand: "#0070f8",      // acento principal (--cm-accent)
        brand2: "#4da3ff",     // acento claro para texto/iconos (--cm-accent-hi)
        glow: "#8cc6ff",       // resplandor / eyebrows (--cm-glow)
        live: "#ff4747",       // punto "en vivo" / errores vivos (--cm-live)
        // La app usa text-zinc-* en cientos de sitios: en vez de tocar cada
        // clase, la escala "zinc" pasa a ser la escala de grises AZULADOS del
        // branding (texto #dce7f7, apagado #a7b9d4...). Así todo el texto
        // encaja con el fondo marino sin reescribir ninguna página.
        zinc: {
          50: "#f4f7fe",
          100: "#eef3fd",
          200: "#dce7f7",
          300: "#c9dcff",
          400: "#a7b9d4",
          500: "#7f92b3",
          600: "#5b6d92",
          700: "#3b4d72",
          800: "#1a2b52",
          900: "#0d1b3f",
          950: "#071433",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-playfair)", "Georgia", "serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        card: "18px",
        "card-lg": "26px",
      },
      boxShadow: {
        neon: "0 0 0 1px rgba(0,112,248,0.30), 0 0 24px rgba(0,112,248,0.34), inset 0 0 26px rgba(0,112,248,0.14)",
        "neon-hi": "0 0 0 1px rgba(91,156,225,0.6), 0 0 34px rgba(0,112,248,0.62), 0 0 110px rgba(0,112,248,0.3), inset 0 0 30px rgba(0,112,248,0.22)",
        card: "0 22px 50px rgba(0,0,0,0.42)",
        btn: "0 10px 34px rgba(0,112,248,0.6), inset 0 -3px 0 rgba(0,40,110,0.5)",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
