import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite acceder al servidor de desarrollo desde la IP de red local (para
  // probar la carta por QR desde un celular en la misma WiFi) sin que Next.js
  // bloquee sus propios recursos internos (HMR, etc.) por seguridad.
  // La IP del equipo va en .env.local (NEXT_DEV_ALLOWED_ORIGINS=192.168.x.y).
  allowedDevOrigins: (process.env.NEXT_DEV_ALLOWED_ORIGINS ?? "").split(",").filter(Boolean),
};

export default nextConfig;
