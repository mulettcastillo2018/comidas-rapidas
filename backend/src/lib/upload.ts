import fs from "node:fs";
import path from "node:path";
import multer from "multer";

const uploadsDir = path.join(__dirname, "..", "..", "uploads", "productos");
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const TIPOS_PERMITIDOS = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export const uploadImagenProducto = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!TIPOS_PERMITIDOS.has(file.mimetype)) {
      cb(new Error("Formato de imagen no soportado (usa JPG, PNG, WEBP o GIF)"));
      return;
    }
    cb(null, true);
  },
});
