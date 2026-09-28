# Comidas Rápidas

Sistema de gestión de pedidos en sala para un restaurante de comida rápida (hamburguesas, salchipapas, sándwiches, gaseosas, perros calientes, pizzas, etc.), enfocado en la comunicación en tiempo real entre meseros y cocina.

No es una tienda online: el pago es físico en el local. El mesero registra mesa, comensales y pedidos desde su celular; cocina los ve en tiempo real y despacha producto por producto; al terminar, el mesero genera la cuenta. El cliente puede ver la carta y dejar armado su pedido escaneando el QR de su mesa (el mesero lo confirma) o el QR de mostrador para pedir para recoger (se confirma y se cobra en caja), y seguir su pedido desde el celular.

## Arquitectura

- `backend/`: Node.js + Express + TypeScript + Prisma + PostgreSQL. Tiempo real con Socket.IO.
- `frontend/`: Next.js (App Router) + TypeScript + Tailwind CSS + Zustand.

Roles de usuario: `ADMIN` (incluye caja y reportes), `MESERO`, `COCINA` y `PANTALLA` (tablero público de pedidos, solo lectura). No hay registro público de clientes.

## Cómo correr en local

Backend:

```bash
cd backend
cp .env.example .env   # completa DATABASE_URL y JWT_SECRET
npm install
npm run prisma:migrate
npm run dev             # http://localhost:4001
```

Frontend:

```bash
cd frontend
cp .env.example .env.local   # NEXT_PUBLIC_URL_PUBLICA antes de imprimir los QR definitivos
npm install
npm run dev              # http://localhost:3010
```

## Pruebas

Unitarias con `npm test` (backend y frontend) y de extremo a extremo con `npm run test:e2e` en el backend. Detalles, requisitos y precauciones en [backend/tests/README.md](backend/tests/README.md).
