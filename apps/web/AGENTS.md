## Stack

Astro (server output) on Vercel via `@astrojs/vercel`, React islands, Tailwind, Clerk (`@clerk/astro`, Spanish localization). The API it talks to runs separately on Cloudflare Workers (`apps/api`).

## Auth

- [src/middleware.ts](src/middleware.ts) is deny-by-default: every route redirects to `/login` without a session, except `PUBLIC_PATHS`. New pages are protected automatically; only add to `PUBLIC_PATHS` deliberately.
- `/login` is a catch-all route (`src/pages/login/[...login].astro`) because Clerk's `<SignIn />` uses sub-paths for multi-step sign-in.
- There is no sign-up page. Sign-up is closed in the Clerk Dashboard (invite-only); hiding UI alone is not access control.
- Calls to the API: get a fresh token with `getToken()` (`useAuth()` from `@clerk/astro/react` in islands, `Astro.locals.auth().getToken()` on the server) right before each call and use `apiFetch` ([src/lib/api.ts](src/lib/api.ts)). Session tokens live ~60s; never cache them.
- The API base URL is `PUBLIC_API_URL` (typed via `astro:env/client`, default `http://localhost:8787`); `apiFetch` already uses it.

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
