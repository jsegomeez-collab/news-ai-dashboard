import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0c10",
        panel: "#15171e",
        edge: "#262a35",
        brand: "#ff7847",
        brand2: "#5b8cff",
      },
    },
  },
  plugins: [],
} satisfies Config;
