# Altaria CRM Tailwind

CRM privado hecho con Astro + React + TailwindCSS + libSQL/Turso.

## Requisitos

- Node 20+
- pnpm

## Arranque local

```bash
pnpm install
cp .env.example .env
pnpm db:init
pnpm dev
```

Abre: `http://localhost:4321`

Usuario inicial local:

```txt
Email: admin@crm.local
Password: admin1234
```

## Crear usuarios privados

No hay registro público. Crea usuarios desde terminal:

```bash
pnpm user:create usuario@empresa.com "Nombre Usuario" "password-segura" admin
pnpm user:create comercial@empresa.com "Comercial" "password-segura" member
```

O genera solo el hash para insertarlo a mano en Turso:

```bash
pnpm user:password "password-segura"
```

## Turso

Ejecuta `database/cloud.sql` en Turso para crear las tablas. Luego inserta usuarios en la tabla `users` con un hash generado mediante `pnpm user:password`.

Variables recomendadas en Vercel:

```env
TURSO_DATABASE_URL=libsql://tu-db-tu-org.turso.io
TURSO_AUTH_TOKEN=...
JWT_SECRET=un-secreto-largo-y-fuerte
NODE_ENV=production
```
