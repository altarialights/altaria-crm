## Stack

Astro (server output) on Vercel via `@astrojs/vercel`, React islands, Tailwind, Clerk (`@clerk/astro`, Spanish localization). The API it talks to runs separately on Cloudflare Workers (`apps/api`).

## Auth

- [src/middleware.ts](src/middleware.ts) is deny-by-default: every route redirects to `/login` without a session, except `PUBLIC_PATHS`. New pages are protected automatically; only add to `PUBLIC_PATHS` deliberately.
- `/login` is a catch-all route (`src/pages/login/[...login].astro`) because Clerk's `<SignIn />` uses sub-paths for multi-step sign-in.
- There is no sign-up page. Sign-up is closed in the Clerk Dashboard (invite-only); hiding UI alone is not access control.
- Calls to the API: get a fresh token with `getToken()` (`useAuth()` from `@clerk/astro/react` in islands, `Astro.locals.auth().getToken()` on the server) right before each call and use `apiFetch` ([src/lib/api.ts](src/lib/api.ts)). Session tokens live ~60s; never cache them.
- The API base URL is `PUBLIC_API_URL` (typed via `astro:env/client`, default `https://altaria-crm.altarialights.workers.dev`); `apiFetch` already uses it. Set it to `http://localhost:8787` in `.env` when running a local API.

## Design

Colors and font come from the brand site, altarialights.com. The tokens live in the `@theme` of [src/styles/global.css](src/styles/global.css) and generate the Tailwind utilities. **Use them instead of Tailwind's default palettes** (no `slate`, `gray`, `blue`...):

| Use | Classes |
|-----|---------|
| Body text, headings | `text-brand-900` (navy, inherited from `<body>`) |
| Secondary / faint text | `text-ink-600` / `text-ink-400` |
| Primary button | `bg-brand-600 text-white hover:bg-brand-900` |
| Soft button, hover, active item | `bg-brand-50` / `bg-brand-100` |
| Links | `text-brand-600 hover:text-brand-700` |
| Borders | `border-ink-200` |
| Surfaces | `bg-white` on the `bg-brand-50` page background |
| Icons and small highlights | `text-accent` (electric blue of the logo, never large areas) |

- Status colors (success, warning, error) have no brand token yet: use Tailwind's `emerald`, `amber` and `red`.
- Font: Geist Variable (`@fontsource-variable/geist`, self-hosted), set as `--font-sans`.
- Clerk components are themed with `appearance` in [astro.config.mjs](astro.config.mjs) using the same hex values, because Clerk can't read CSS variables. Change both together.
- Favicons are the brand site's ones, in `public/`.

## Layout and navigation

- [src/layouts/AppLayout.astro](src/layouts/AppLayout.astro) is the authenticated shell: sidebar on the left (fixed from `lg` up, drawer below), content on the right. Add menu entries in [src/lib/navigation.ts](src/lib/navigation.ts).
- The sidebar is a React component hydrated with `client:load` for desktop flyouts and the mobile drawer. The toggle is hydrated only below `lg` (`client:media`). The active item is resolved on the server from `Astro.url.pathname`.
- Menu entries can have `children`: they open in a flyout on desktop hover, click or keyboard, and inline on mobile. Desktop panels are portalled outside the scrollable navigation to prevent clipping.
- Clerk's `UserButton` is the Astro component passed into the sidebar as a slot (React can't render Astro components, and the slot is never re-rendered by React).
- Islands that share state use nanostores ([src/stores/](src/stores/)), e.g. the drawer's open state between `SidebarToggle` and `Sidebar`.
- The gallery (`src/components/gallery/`) is a React island on `/tarjetas/galeria`. It uses authenticated `/v1/gallery` calls; `/tarjetas/archivo/[id].ts` proxies private images with a fresh server-side Clerk token so native `<img>` and downloads work without exposing tokens in URLs.
- Assignments (`src/components/cards/`) uses `/v1/cards` and paginates to the available table height. Cards have saved permanent public URLs; QR generation uses that URL, never the editable destination. `qrcode` is loaded on demand in the browser for PNG/SVG export and a large/fullscreen preview. No QR generation request is sent to an external service.
- Clients (`src/components/clients/`) has `/clientes/lista` and `/clientes/fases` under the Clients flyout. The list paginates to the available height. The board uses `@dnd-kit/core`/`sortable`, pointer/touch/keyboard sensors, a drag overlay and seven droppable columns. Blank areas of cards start mouse/touch dragging; text and controls are excluded. Focused cards support keyboard dragging, and their phase selectors provide another way to move them. Drag changes are optimistic, persisted with client versions and reconciled on errors. Each column loads more clients independently.
- Client forms share their data with the board/list. Card assignments select registered clients through `ClientPicker`; older text-only assignments remain visible until linked explicitly. `/contactos` and `/empresas` redirect to the client list.
- Company logos are optional in the client form, with a local preview, replacement and removal. Files use multipart client saves; text-only saves remain JSON. The private `/clientes/logo/[id].ts` proxy streams images using a fresh Clerk token, and `ClientLogo` displays them in the list and board without enabling native image dragging.

## Configuration

- Env vars: local values in `.env` (copy `.env.example`); production values in Vercel → Project → Settings → Environment Variables. Declare new ones in the `env.schema` of [astro.config.mjs](astro.config.mjs) and read them from `astro:env/client` / `astro:env/server`.
- `PUBLIC_*` vars are inlined at build time: changing them in Vercel requires a redeploy.
- Clerk keyless mode is disabled in `astro.config.mjs`, so missing Clerk keys fail loudly instead of creating a throwaway instance.
- Vercel project: Root Directory `apps/web`; it builds with `astro build` and deploys on every push to `main`.

## Development

When starting the dev server, use background mode (run from `apps/web`, or prefix with `pnpm --filter @altaria/web exec` from the repo root):

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
