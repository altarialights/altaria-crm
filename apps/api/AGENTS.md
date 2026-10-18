## Stack

Hono on Cloudflare Workers, configured in `wrangler.jsonc`.

## Development

- `pnpm dev` (from `apps/api`) starts `wrangler dev` on http://localhost:8787.
- After changing bindings or `vars` in `wrangler.jsonc`, run `pnpm cf-typegen` to regenerate `worker-configuration.d.ts` (commit it). Bindings are typed as the global `CloudflareBindings` interface, used as `new Hono<{ Bindings: CloudflareBindings }>()`.
- Local secrets go in `.dev.vars` (see `.dev.vars.example`); production secrets via `wrangler secret put`.
- The Worker `name` in `wrangler.jsonc` must match the Worker in the Cloudflare dashboard.

## Documentation

- Hono: https://hono.dev/docs/getting-started/cloudflare-workers
- Wrangler: https://developers.cloudflare.com/workers/wrangler/
