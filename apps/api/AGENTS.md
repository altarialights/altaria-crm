## Stack

Hono on Cloudflare Workers, configured in `wrangler.jsonc`. Database: Turso (libSQL) via `@libsql/client/web`. Auth: Clerk session tokens verified with `@clerk/backend`.

## Security model

- `GET /health` is the only public route. Everything under `/v1` goes through `requireAuth` ([src/middleware/auth.ts](src/middleware/auth.ts)), which verifies the Clerk session token from `Authorization: Bearer <token>` and sets `c.var.auth` (`userId`, `sessionId`, `orgId`). Mount new routes on the `v1` app so they inherit it.
- `authorizedParties` (the token's `azp` claim) and CORS both use `WEB_ORIGINS`. When the web app gets a new origin (production domain), add it there.
- Sign-up is closed in the Clerk Dashboard (invite-only), so any valid session is a staff member. Add role/org checks here if that changes.
- Errors: throw `HTTPException` for expected failures; anything else is logged as JSON and returned as a generic 500 — never leak internals.
- `secureHeaders()` applies globally. After authentication, `/v1` has a 1 MB body limit, except gallery image uploads (10 MB plus bounded multipart overhead).

## Database

- `createDb(c.env)` ([src/db.ts](src/db.ts)) returns a Turso client. Create it per request; never store it at module scope.
- Gallery schema and storage conventions: [migrations/README.md](migrations/README.md). `gallery_folders` stores categories and `gallery_images` stores image metadata; files will live in R2.
- Apply SQL migrations explicitly with `pnpm --filter @altaria/api db:migrate` from the repo root. It targets `TURSO_DATABASE_URL` from the environment or `.dev.vars`. Never run migrations during API requests.
- `pnpm --filter @altaria/api test:db` checks migrations and schema constraints against disposable in-memory databases.

## Gallery storage

- R2 bucket `altaria-crm` is bound as `c.env.GALLERY_BUCKET` in `wrangler.jsonc`. No S3 credentials or `.dev.vars` entries are needed for this binding.
- The bucket should remain private; gallery file routes must use the authenticated `v1` app.
- `remote: true` connects development to the real R2 bucket, matching the remote Turso database. Development uploads and deletions affect real files and records; Wrangler must be signed into the bucket's account.
- `/v1/gallery` implements folder CRUD, image listing/search/pagination, uploads, renaming, deletion and authenticated image streaming. Files are limited to 10 MB and checked by signature. Nonempty folders cannot be deleted.
- R2 uploads precede SQL insertion; insertion failures delete the newly uploaded object. Image deletion removes R2 first, preserving the record on R2 failure so it can be retried. SQL and R2 have no shared transaction.
- Run `pnpm --filter @altaria/api test:gallery` for service and HTTP route integration checks using disposable databases and an in-memory bucket.

## Development

- `pnpm dev` (from `apps/api`) starts `wrangler dev` on http://localhost:8787.
- Secrets are declared in `wrangler.jsonc` → `secrets.required`. Local values go in `.dev.vars` (copy `.dev.vars.example`); production values via `pnpm exec wrangler secret put <NAME>`.
- After changing bindings, `vars` or `secrets` in `wrangler.jsonc`, run `pnpm cf-typegen` to regenerate `worker-configuration.d.ts` (commit it). Bindings are typed as the global `CloudflareBindings`; the Hono app type is `AppEnv` in [src/types.ts](src/types.ts).
- The Worker `name` in `wrangler.jsonc` must match the Worker in the Cloudflare dashboard.
- Cloudflare Workers Builds: Root directory `apps/api`, no separate build command, Deploy command `pnpm run deploy`. Running Wrangler from the workspace root without targeting this app triggers framework detection and fails.
- Manual deploy from the repo root: `pnpm turbo run deploy --filter=@altaria/api`. Current Worker: `altaria-crm`, URL `https://altaria-crm.altarialights.workers.dev`.

## Documentation

- Hono: https://hono.dev/docs/getting-started/cloudflare-workers
- Clerk backend: https://clerk.com/docs/reference/backend/authenticate-request
- Turso: https://docs.turso.tech/sdk/ts/reference
- Wrangler: https://developers.cloudflare.com/workers/wrangler/
