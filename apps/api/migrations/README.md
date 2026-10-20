# Card gallery schema

Run from the repository root:

```sh
pnpm --filter @altaria/api db:migrate
pnpm --filter @altaria/api test:db
```

The migration command reads `apps/api/.dev.vars` if present. Existing environment
variables take precedence. It applies changes to `TURSO_DATABASE_URL`; it is never
run automatically on startup or deploy. Use the database's write token.

SQL files run in filename order, each inside a write transaction. The internal
`_schema_migrations` table records their checksum. Add a new migration for future
changes; never edit an applied file. Tests use disposable in-memory databases.

## Storage convention

- `gallery_folders`: UUID, display name, unique stable `storage_prefix`, timestamps.
- `gallery_images`: UUID, folder, display name, R2 object key, original filename,
  MIME type, size in bytes, timestamps.
- Example key: `restaurantes/550e8400-e29b-41d4-a716-446655440000.webp`.
- Generate IDs using `crypto.randomUUID()`. Create a lowercase ASCII prefix when
  creating a folder, rejecting conflicts or appending a unique suffix. Prefixes
  must use letters, digits and internal hyphens; names can contain accents.
- Renaming a folder changes its display name, preserving its prefix. Set
  `updated_at` explicitly on updates. A future move between folders must also copy
  the R2 object to its new prefix and update `object_key` before deleting the old object.
- R2 has object prefixes rather than physical directories. Empty folders exist in
  the database and appear in R2 once their first image is uploaded.
- Deleting a nonempty folder is restricted to prevent orphaned images. Delete R2
  objects and their image records deliberately before removing the folder.
- R2 bucket `altaria-crm` is configured in `wrangler.jsonc` as `GALLERY_BUCKET`.
  Both deployed Workers and development use the real bucket (`remote: true`),
  matching the remote Turso database. Development requires Wrangler authentication.
  No S3 credentials are required. Deploy the API to apply the binding in production.
- Folder management and image uploads are implemented under `/v1/gallery` and
  `/tarjetas/galeria`. The web image endpoint `/tarjetas/archivo/:id` streams files
  with a fresh Clerk token; image URLs do not expose tokens or public R2 access.
- Uploads accept JPEG, PNG, WebP, GIF and AVIF up to 10 MB per image. Renaming a
  design changes metadata only. Listing accepts 1–24 images per page.

## Card assignments

- `0002_card_assignments.sql` adds `cards`: one permanent UUID/link for each physical card, reference, customer name, destination, optional gallery design, state and timestamps.
- States are `free`, `active`, `paused`. Active/paused cards require a customer and destination. Free cards have neither. Releasing preserves the ID, public URL and design.
- Design deletion sets `design_id` to NULL. It never removes a physical card or its destination.
- `CARD_PUBLIC_ORIGIN` in the Worker config determines links for new cards only. Existing rows preserve `public_url`, including when the origin changes later. Keep old domains routed to the Worker while printed cards use them.
- Management is authenticated under `/v1/cards`; public GET/HEAD `/t/:id` issues a `302` with `Cache-Control: no-store` only for active cards. Destinations accept HTTP/HTTPS without credentials and reject links back into the card redirect service.
- Run `pnpm --filter @altaria/api test:cards` for lifecycle, HTTP and database checks. Apply the migration explicitly before deploying the new Worker.

## Clients

- `0003_clients.sql` adds `clients` with optional contact/company details, notes, seven fixed phases, ordering rank, optimistic version and timestamps. Names are labels and may repeat.
- It also adds nullable `cards.client_id` with `ON DELETE RESTRICT`. Existing customer names, destinations, public URLs and physical card IDs remain untouched. Customers on older text-only assignments can be linked explicitly from the card form.
- Linked cards show the client's current name. Releasing a card clears its client ID and customer/destination; client deletion requires releasing or reassigning linked cards first.
- `/v1/clients` manages client records. `/v1/clients/board` returns a bounded first page per phase, and the listing loads further pages by phase and position. `/v1/clients/:id/move` persists phase/order transactionally; all updates, moves and deletions check the current client version.
- `pnpm --filter @altaria/api test:clients` verifies validation, ordering, rank compaction, pagination, conflicts and card/client relations.
