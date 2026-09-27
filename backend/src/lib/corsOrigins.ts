// Se acepta tanto localhost como la IP de red local, para poder probar la
// carta pública por QR desde un celular en la misma red WiFi.
export const allowedOrigins = (process.env.FRONTEND_URL ?? "http://localhost:3010,http://192.168.101.6:3010").split(",");
