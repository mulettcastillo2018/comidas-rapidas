import "dotenv/config";
import http from "node:http";
import path from "node:path";
import cors from "cors";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { Prisma } from "@prisma/client";

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
import { cajaRouter } from "./routes/caja.routes";
import { seguimientoRouter } from "./routes/seguimiento.routes";
import { inventarioRouter } from "./routes/inventario.routes";
import { llamadosRouter } from "./routes/llamados.routes";
import { encuestasRouter } from "./routes/encuestas.routes";
import { allowedOrigins } from "./lib/corsOrigins";
import { ErrorDeNegocio } from "./lib/errores";
import { iniciarRevisionRetrasos } from "./services/retrasoChecker";
import { iniciarLimpiezaPeriodica } from "./services/limpieza";

const app = express();
const port = process.env.PORT ?? 4001;

// Detrás de un proxy (Nginx, Render, Railway...) todas las peticiones llegan
// desde la IP del proxy; esto hace que req.ip sea la del cliente real, que es
// la que usan los límites de pedidos por dispositivo.
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);

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
app.use("/caja", cajaRouter);
app.use("/seguimiento", seguimientoRouter);
app.use("/inventario", inventarioRouter);
app.use("/llamados", llamadosRouter);
app.use("/encuestas", encuestasRouter);

// Errores de Prisma que son culpa de la petición (dato repetido, registro que
// ya no existe o que otros registros usan), no fallas del servidor.
const ERRORES_PRISMA: Record<string, { status: number; mensaje: string }> = {
  P2002: { status: 409, mensaje: "Ya existe un registro con esos datos." },
  P2003: { status: 409, mensaje: "No se puede completar: hay otros registros que dependen de este." },
  P2025: { status: 404, mensaje: "El registro no existe o ya fue eliminado." },
};

// Manejador de errores global: cualquier error no atrapado en las rutas termina
// aquí en vez de tumbar el proceso completo.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) return;
  if (err instanceof ErrorDeNegocio) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && ERRORES_PRISMA[err.code]) {
    const { status, mensaje } = ERRORES_PRISMA[err.code];
    res.status(status).json({ error: mensaje });
    return;
  }
  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "La imagen supera el máximo de 5 MB." : "No se pudo subir el archivo." });
    return;
  }
  console.error(err);
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
iniciarLimpiezaPeriodica();
