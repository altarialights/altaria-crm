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
  design changes metadata only. Listing is paginated at 24 images per page.
- Assignment tables remain pending implementation.
