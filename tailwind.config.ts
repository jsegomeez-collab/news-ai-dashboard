import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Paleta "azulada": fondo con tinte navy en vez de gris neutro, y más
        // salto de luminosidad entre ink/panel/edge que antes (las tarjetas
        // se distinguían apenas del fondo). brand = azul (acción/marca
        // principal); brand2 = naranja/ámbar (acento secundario puntual:
        // alertas, "en vivo", relevancia alta) — mismo contraste azul/naranja
        // de la referencia, pero con el azul como protagonista.
        ink: "#070b16",
        panel: "#101a2e",
        panel2: "#16233d",
        edge: "#2a3a5c",
        brand: "#3b82f6",
        brand2: "#ff8a3d",
      },
    },
  },
  plugins: [],
} satisfies Config;
