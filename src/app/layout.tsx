import type { Metadata } from "next";
import { Inter, Playfair_Display, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { AuroraBackground } from "@/components/AuroraBackground";

// Las tres familias del branding (ver example.html): Inter para todo, Playfair
// itálica solo para acentos en titulares, JetBrains Mono para los "eyebrows".
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const playfair = Playfair_Display({ subsets: ["latin"], weight: ["700"], style: ["italic"], variable: "--font-playfair" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "AutoGuiones PRO — Dashboard",
  description: "Noticias de IA para negocios + motor de guiones",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${playfair.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen font-sans">
        <AuroraBackground />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
