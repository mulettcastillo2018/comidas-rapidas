// Orígenes del frontend, separados por coma. Para probar la carta por QR
// desde un celular en la misma red WiFi, agrega también la IP del equipo en
// el .env (p. ej. FRONTEND_URL=http://localhost:3010,http://192.168.x.y:3010).
export const allowedOrigins = (process.env.FRONTEND_URL ?? "http://localhost:3010").split(",");
