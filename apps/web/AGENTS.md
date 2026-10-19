## Stack

Astro (server output) on Cloudflare Workers via `@astrojs/cloudflare`, React islands, Tailwind, Clerk (`@clerk/astro`, Spanish localization).

## Auth

- [src/middleware.ts](src/middleware.ts) is deny-by-default: every route redirects to `/login` without a session, except `PUBLIC_PATHS`. New pages are protected automatically; only add to `PUBLIC_PATHS` deliberately.
- `/login` is a catch-all route (`src/pages/login/[...login].astro`) because Clerk's `<SignIn />` uses sub-paths for multi-step sign-in.
- There is no sign-up page. Sign-up is closed in the Clerk Dashboard (invite-only); hiding UI alone is not access control.
- Calls to the API: get a fresh token with `getToken()` (`useAuth()` from `@clerk/astro/react` in islands, `Astro.locals.auth().getToken()` on the server) right before each call and use `apiFetch` ([src/lib/api.ts](src/lib/api.ts)). Session tokens live ~60s; never cache them.
- The API base URL is the runtime var `API_URL` (`import { env } from 'cloudflare:workers'`), passed to islands as a prop.

## Configuration

- Runtime vars and secrets come from `cloudflare:workers` `env`, not `import.meta.env`. Secrets are declared in `wrangler.jsonc` → `secrets.required`; local values go in `.dev.vars` (copy `.dev.vars.example`).
- After changing `wrangler.jsonc`, run `pnpm cf-typegen` and commit `worker-configuration.d.ts`.
- Astro sessions are disabled (`session: false`) and images use `passthrough`, so no KV or Images bindings are provisioned.

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
