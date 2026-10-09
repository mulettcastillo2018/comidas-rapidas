import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toast } from "@/components/Toast";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Comidas Rápidas",
  description: "Gestión de pedidos en sala: mesero y cocina en tiempo real.",
};

// Geist: sans-serif variable, muy legible en pantallas pequeñas y con cifras
// tabulares para precios y tiempos. Next la sirve desde el propio sitio.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const viewport: Viewport = {
  themeColor: "#faf8f6",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${geist.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Toast />
      </body>
    </html>
  );
}
