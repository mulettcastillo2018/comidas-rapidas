import type { Metadata } from "next";
import "./globals.css";
import { Toast } from "@/components/Toast";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Comidas Rápidas",
  description: "Gestión de pedidos en sala: mesero y cocina en tiempo real.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Toast />
      </body>
    </html>
  );
}
