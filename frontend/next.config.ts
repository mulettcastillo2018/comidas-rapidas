import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite acceder al servidor de desarrollo desde la IP de red local (para
  // probar la carta por QR desde un celular en la misma WiFi) sin que Next.js
  // bloquee sus propios recursos internos (HMR, etc.) por seguridad.
  allowedDevOrigins: ["192.168.101.6"],
};

export default nextConfig;
