import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // "Halo theme": base neutra y sobria tipo Notion dark (sin el tinte
        // navy saturado de antes — el color ahora lo pone el halo ambiental
        // de fondo y los acentos, no la superficie) con bordes de bajo
        // contraste ("apenas están ahí"). brand = azul (acción/marca
        // principal); brand2 = naranja/ámbar (acento secundario puntual).
        ink: "#0a0a0c",
        panel: "#141416",
        panel2: "#1c1c1f",
        edge: "#26262a",
        brand: "#3b82f6",
        brand2: "#ff8a3d",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
