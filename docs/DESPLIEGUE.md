# Publicar una demo

Una demo en línea, gratis:

| Pieza | Servicio | Plan | Para qué |
|---|---|---|---|
| Base de datos | [Neon](https://neon.tech) | Gratis | PostgreSQL |
| API | [Render](https://render.com) | Gratis | Backend Express + Socket.IO (usa `render.yaml`) |
| Frontend | [Vercel](https://vercel.com) | Gratis (Hobby) | Next.js |

> **Tiempo real:** Render acepta WebSockets, así que cocina, pantalla y meseros se actualizan solos igual que en local. La API corre en **una sola instancia** (las tareas periódicas y Socket.IO viven en memoria): no subas el número de instancias sin agregar antes un adaptador de Redis.
>
> **Imágenes de productos:** se guardan en el disco del servicio, que el plan gratis de Render borra al reiniciar. Para una demo basta; para un restaurante real hay que moverlas a un almacenamiento externo (R2/S3).

## 1. Base de datos (Neon)

1. Crea un proyecto **nuevo** (no uses la base de desarrollo) en la región **AWS US East 2 (Ohio)**, la misma de la API en Render.
2. En *Connect*, desactiva *Connection pooling* y copia la cadena de conexión: será `DATABASE_URL`. No la pegues en chats ni la subas al repositorio.
3. Carga las tablas y los datos iniciales **desde tu computador**, apuntando a esa base. En PowerShell, una línea a la vez:
   ```powershell
   Set-Location -LiteralPath "<ruta del repositorio>\backend"
   $env:DATABASE_URL = "<la de Neon>"
   $env:SEED_ADMIN_PASSWORD = "<una contraseña fuerte y nueva>"
   npx prisma migrate deploy
   npx prisma db seed
   Remove-Item Env:DATABASE_URL, Env:SEED_ADMIN_PASSWORD
   ```
   El seed crea el administrador `admin@comidasrapidas.test` con esa contraseña, la sede principal, 5 categorías, 6 productos y 6 mesas.

## 2. API (Render)

1. En Render → *New* → *Blueprint*, elige este repositorio: Render lee `render.yaml` y crea el servicio `comidas-rapidas-api`.
2. Completa las variables:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | La de Neon |
| `FRONTEND_URL` | La dirección de Vercel (paso 3), p. ej. `https://comidas-rapidas-demo.vercel.app` |

`JWT_SECRET` lo genera Render solo. Las migraciones se aplican en cada arranque.

3. Cuando termine, `https://<tu-api>/health` debe responder `{"ok":true,"db":true}`.

## 3. Frontend (Vercel)

1. En Vercel → *Add New* → *Project*, importa este repositorio y en *Root Directory* elige `frontend`. El nombre del proyecto define la dirección (`<nombre>.vercel.app`); si ya está ocupada, agrégala después en *Settings* → *Domains*.
2. Variables de entorno:
   - `NEXT_PUBLIC_API_URL` = la dirección de Render.
   - `NEXT_PUBLIC_URL_PUBLICA` = la dirección de Vercel (con ella se generan los QR de las mesas y el enlace de la encuesta).
3. Despliega y, si la dirección final no es la que pusiste en `FRONTEND_URL`, corrígela en Render.

## 4. Primeros pasos en la demo

1. Entra como `admin@comidasrapidas.test` y cambia la contraseña.
2. En *Admin* → *Usuarios* crea las cuentas de mesero y cocina (y una de pantalla si quieres mostrarla en un televisor).
3. En *Admin* → *Productos*, desmarca "Pasa por cocina" en las bebidas.
4. En *Admin* → *Carta QR* imprime o abre los QR de las mesas para probar el pedido desde el celular.

## 5. Opcional

- **Facturación electrónica**: pon el token de pruebas de Alanube en *Admin* → *Facturación* (o como `ALANUBE_TOKEN` en Render) y crea la empresa en su ambiente de pruebas.

## Qué tener en cuenta

- El plan gratis de Render **duerme el servicio** tras 15 minutos sin uso: la primera visita puede tardar cerca de un minuto y, mientras duerme, no corren las tareas periódicas (avisos de retraso, limpieza, envío de facturas); se ponen al día al despertar.
- Al reiniciar o publicar una versión nueva, la API se apaga en orden (deja de aceptar conexiones, termina lo que está en curso y cierra la base); el CI lo verifica en cada cambio.
- Las contraseñas de prueba que aparecen en el historial del repositorio no deben usarse en la demo.
