## Stack

Hono on Cloudflare Workers, configured in `wrangler.jsonc`. Database: Turso (libSQL) via `@libsql/client/web`. Auth: Clerk session tokens verified with `@clerk/backend`.

## Security model

- `GET /health` and `GET`/`HEAD /t/:id` are public. The card link returns a temporary redirect or a generic unavailable page. Everything under `/v1` goes through `requireAuth` ([src/middleware/auth.ts](src/middleware/auth.ts)), which verifies the Clerk session token from `Authorization: Bearer <token>` and sets `c.var.auth` (`userId`, `sessionId`, `orgId`). Mount management routes on the `v1` app so they inherit it.
- `authorizedParties` (the token's `azp` claim) and CORS both use `WEB_ORIGINS`. When the web app gets a new origin (production domain), add it there.
- Sign-up is closed in the Clerk Dashboard (invite-only), so any valid session is a staff member. Add role/org checks here if that changes.
- Errors: throw `HTTPException` for expected failures; anything else is logged as JSON and returned as a generic 500 — never leak internals.
- `secureHeaders()` applies globally. After authentication, `/v1` has a 1 MB body limit, except gallery uploads and multipart client create/update requests with logos (10 MB plus bounded multipart overhead).

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

## Card assignments

- `/v1/cards` manages physical cards: create, list/search/filter, edit, pause/resume and release. There is no delete endpoint: printed QR/NFC links keep their identity.
- `CARD_PUBLIC_ORIGIN` sets the HTTPS origin for newly created cards. Each card saves its complete `public_url`; changing the setting never rewrites existing links. Configure a custom domain on the Worker before using it here.
- Public `/t/:id` reads the current destination on every request, returns `302` and `Cache-Control: no-store`, and never exposes customer or design metadata. Free, paused and missing cards share a generic 404 page.
- `cards.client_id` links registered clients; list/detail responses resolve their current names. Older text-only assignments remain valid. An optional gallery design uses `ON DELETE SET NULL`; releasing a card clears the client link/customer/destination and preserves its design and public link.
- `pnpm --filter @altaria/api test:cards` checks assignment lifecycle, URL validation, pagination and redirects with disposable databases.

## Clients

- `/v1/clients` provides authenticated CRUD, search, phase filters and pagination. `/board` returns a consistent read snapshot with the first 20 clients and total count for each phase; list pages load additional cards.
- Phases: `uncontacted`, `first_contact`, `meeting_scheduled`, `quote_sent`, `quote_accepted`, `project_started`, `project_finished`. Phase definitions live in `src/clients/service.ts` and `apps/web/src/lib/clients.ts`; keep them aligned.
- Clients store name, company, email, phone, website, notes, phase, position and version. Names can repeat. Updates, moves and deletions require the current `version`; stale operations return 409.
- Optional company logos use the existing private `GALLERY_BUCKET` under `client-logos/<client UUID>/<image UUID>.<extension>`. Migration `0004_client_logos.sql` adds nullable key/MIME/size metadata. Logos do not appear in the design gallery.
- Client create/update accepts JSON or multipart with a JSON `data` field and one optional `logo` file (same formats/signature checks and 10 MB limit as gallery images). `removeLogo: true` clears it. Saving fields and logo metadata shares one SQL transaction; failed saves clean up the new object. Replacement, removal and client deletion clean up the previous object only after commit; cleanup failures are logged for recovery because SQL and R2 have no shared transaction.
- `GET /v1/clients/:id/logo` streams the current logo with authentication and private/no-store headers. Responses expose a same-origin `logoUrl` with an image version, never bucket keys or tokens.
- `POST /:id/move` accepts `stage`, optional `beforeId`, and `version`. A write transaction computes a rank between neighboring clients, or appends at the actual end of the column. Rare rank compaction uses a MATERIALIZED snapshot so updates cannot reorder the source during the statement.
- Client deletion is restricted while cards reference it. Release or reassign those cards first. Migration `0003_clients.sql` preserves existing card links and customer names.
- `pnpm --filter @altaria/api test:clients` checks data validation, ordering/compaction, stale writes, board pagination, HTTP routes and card relationships using disposable databases.

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
