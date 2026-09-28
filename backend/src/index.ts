import "dotenv/config";
import http from "node:http";
import path from "node:path";
import cors from "cors";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import { createRealtimeServer } from "./realtime/socket";
import { authRouter } from "./routes/auth.routes";
import { categoriasRouter } from "./routes/categorias.routes";
import { productosRouter } from "./routes/productos.routes";
import { mesasRouter } from "./routes/mesas.routes";
import { usuariosRouter } from "./routes/usuarios.routes";
import { mesaSesionesRouter } from "./routes/mesaSesiones.routes";
import { pedidosRouter } from "./routes/pedidos.routes";
import { facturasRouter } from "./routes/facturas.routes";
import { reportesRouter } from "./routes/reportes.routes";
import { cartaRouter } from "./routes/carta.routes";
import { notificacionesRouter } from "./routes/notificaciones.routes";
import { solicitudesRouter } from "./routes/solicitudes.routes";
import { allowedOrigins } from "./lib/corsOrigins";
import { iniciarRevisionRetrasos } from "./services/retrasoChecker";

const app = express();
const port = process.env.PORT ?? 4001;

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/auth", authRouter);
app.use("/categorias", categoriasRouter);
app.use("/productos", productosRouter);
app.use("/mesas", mesasRouter);
app.use("/usuarios", usuariosRouter);
app.use("/mesa-sesiones", mesaSesionesRouter);
app.use("/pedidos", pedidosRouter);
app.use("/facturas", facturasRouter);
app.use("/reportes", reportesRouter);
app.use("/carta", cartaRouter);
app.use("/notificaciones", notificacionesRouter);
app.use("/solicitudes", solicitudesRouter);

// Manejador de errores global: cualquier error no atrapado en las rutas termina
// aquí en vez de tumbar el proceso completo.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Error interno del servidor." });
});

process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection:", reason);
});

const httpServer = http.createServer(app);
createRealtimeServer(httpServer);

httpServer.listen(port, () => {
  console.log(`API escuchando en http://localhost:${port}`);
});

iniciarRevisionRetrasos();
