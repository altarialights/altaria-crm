## Stack

Hono on Cloudflare Workers, configured in `wrangler.jsonc`. Database: Turso (libSQL) via `@libsql/client/web`. Auth: Clerk session tokens verified with `@clerk/backend`.

## Security model

- `GET /health` is the only public route. Everything under `/v1` goes through `requireAuth` ([src/middleware/auth.ts](src/middleware/auth.ts)), which verifies the Clerk session token from `Authorization: Bearer <token>` and sets `c.var.auth` (`userId`, `sessionId`, `orgId`). Mount new routes on the `v1` app so they inherit it.
- `authorizedParties` (the token's `azp` claim) and CORS both use `WEB_ORIGINS`. When the web app gets a new origin (production domain), add it there.
- Sign-up is closed in the Clerk Dashboard (invite-only), so any valid session is a staff member. Add role/org checks here if that changes.
- Errors: throw `HTTPException` for expected failures; anything else is logged as JSON and returned as a generic 500 — never leak internals.
- Also applied globally: `secureHeaders()`, 1 MB `bodyLimit`.

## Database

- `createDb(c.env)` ([src/db.ts](src/db.ts)) returns a Turso client. Create it per request; never store it at module scope.
- The schema is not defined yet.

## Development

- `pnpm dev` (from `apps/api`) starts `wrangler dev` on http://localhost:8787.
- Secrets are declared in `wrangler.jsonc` → `secrets.required`. Local values go in `.dev.vars` (copy `.dev.vars.example`); production values via `pnpm exec wrangler secret put <NAME>`.
- After changing bindings, `vars` or `secrets` in `wrangler.jsonc`, run `pnpm cf-typegen` to regenerate `worker-configuration.d.ts` (commit it). Bindings are typed as the global `CloudflareBindings`; the Hono app type is `AppEnv` in [src/types.ts](src/types.ts).
- The Worker `name` in `wrangler.jsonc` must match the Worker in the Cloudflare dashboard.

## Documentation

- Hono: https://hono.dev/docs/getting-started/cloudflare-workers
- Clerk backend: https://clerk.com/docs/reference/backend/authenticate-request
- Turso: https://docs.turso.tech/sdk/ts/reference
- Wrangler: https://developers.cloudflare.com/workers/wrangler/
