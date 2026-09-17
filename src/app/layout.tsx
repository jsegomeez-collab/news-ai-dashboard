import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { AuroraBackground } from "@/components/AuroraBackground";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "AI Actualidad — Dashboard",
  description: "Noticias de IA para negocios + motor de guiones",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="min-h-screen font-sans">
        <AuroraBackground />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
