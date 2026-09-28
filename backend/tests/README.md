# Pruebas

## Unitarias (reglas de negocio, sin base de datos)

```bash
npm test                # backend: estado del pedido, hora estimada, fechas en hora de Colombia, nombres, límites
cd ../frontend && npm test   # frontend: división de la cuenta por persona y propina sugerida
```

## De extremo a extremo (contra el backend corriendo)

Recorren los flujos reales por la API y verifican el resultado en la base:
operaciones simultáneas (abrir mesa, confirmar, cobrar, cerrar caja), mesas
desactivadas, límites contra abuso, limpieza automática, reporte de ventas,
cierre de caja, seguimiento público, datos personales, bebidas que no pasan por
cocina, agotados, comensales y cambio de mesa.

Requisitos:

- El backend corriendo (`npm run dev`), por defecto en `http://localhost:4001`.
- Las cuentas de prueba activas, todas con la misma contraseña:
  `admin@comidasrapidas.test`, `mesero2_test@comidasrapidas.test` y
  `cocina_test@comidasrapidas.test` (se pueden cambiar con `E2E_ADMIN`,
  `E2E_MESERO` y `E2E_COCINA`).
- La contraseña se pasa por variable de entorno; **no** se guarda en el repositorio.

```powershell
# PowerShell
$env:E2E_PASSWORD = "<contraseña de las cuentas de prueba>"
npm run test:e2e              # todas
npm run test:e2e -- caja      # solo las que contienen "caja" en el nombre
```

```bash
# bash
E2E_PASSWORD="<contraseña>" npm run test:e2e
```

### Cuidado

- **Crean y borran datos** (mesas `E2E-…`, pedidos, cuentas, un cierre de caja
  de prueba que luego se deshace). Solo contra desarrollo: si `E2E_API_URL` no
  es local, se niegan a correr salvo que se ponga `E2E_PERMITIR_REMOTO=1`.
- Al terminar (o si fallan a mitad) borran todo lo que crearon. Un producto real
  que la prueba marque agotado se vuelve a dejar disponible.
- Cada corrida hace unos 15 pedidos por QR desde este equipo, y el backend
  acepta 30 por dispositivo cada 10 minutos: si se corre la suite más de dos
  veces seguidas, reinicia el backend (el contador está en memoria).
- La prueba del límite de 30 pedidos por dispositivo es opcional
  (`E2E_INCLUIR_LIMITE_IP=1`) porque deja este equipo sin poder pedir por QR
  durante 10 minutos.

## Schema vs. base de datos

```bash
npm run db:verificar
```

Compara `prisma/schema.prisma` con la base real: sale con código 0 y
"No difference detected" si coinciden, y con código 2 y el SQL de diferencia si
alguien cambió una sin la otra (p. ej. una migración sin aplicar). Útil antes de
publicar.

> En la red de la oficina el proxy bloquea la descarga de los motores de
> Prisma: antes de este comando (y de `prisma generate`/`migrate`), carga en la
> terminal las variables `PRISMA_*` del `.env` que apuntan a los motores locales.
