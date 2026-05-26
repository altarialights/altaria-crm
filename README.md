# Altaria CRM Tailwind

CRM privado hecho con Astro + React + TailwindCSS + libSQL/Turso.

## Requisitos

- Node 20+
- pnpm

## Arranque

```bash
pnpm install
pnpm dev
```

Abre: `http://localhost:4321`

## Crear usuarios privados

No hay registro público. Crea usuarios desde terminal:

```bash
pnpm user:create usuario "Nombre Usuario" "password-segura"
```

O genera solo el hash para insertarlo a mano en Turso:

```bash
pnpm user:password "password-segura"
```

## Turso

El comando `pnpm user:create` inserta el usuario en la base configurada en `.env`.
Si `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` apuntan a producción, el usuario se crea directamente en Turso.

Variables recomendadas en Vercel:

```env
TURSO_DATABASE_URL=libsql://tu-db-tu-org.turso.io
TURSO_AUTH_TOKEN=...
JWT_SECRET=un-secreto-largo-y-fuerte
NODE_ENV=production
```
