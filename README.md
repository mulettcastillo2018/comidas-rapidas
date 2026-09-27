# Comidas Rápidas

Sistema de gestión de pedidos en sala para un restaurante de comida rápida (hamburguesas, salchipapas, sándwiches, gaseosas, perros calientes, pizzas, etc.), enfocado en la comunicación en tiempo real entre meseros y cocina.

No es una tienda online: el cliente nunca usa el sitio directamente. El mesero registra todo desde su celular (mesa, comensales, pedidos); cocina ve las solicitudes en tiempo real en una pantalla; al terminar, el mesero genera la factura para el pago físico en el local.

## Arquitectura

- `backend/`: Node.js + Express + TypeScript + Prisma + PostgreSQL. Tiempo real con Socket.IO (mesero ↔ cocina).
- `frontend/`: Next.js (App Router) + TypeScript + Tailwind CSS + Zustand.

Roles de usuario: `ADMIN`, `MESERO`, `COCINA`. No hay registro público de clientes.

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
npm install
npm run dev              # http://localhost:3010
```
