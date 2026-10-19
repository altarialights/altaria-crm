## Package manager

**Always pnpm. Never npm, npx or yarn** — in commands, docs, scripts, CI and dashboard build settings.

| Instead of | Use |
|------------|-----|
| `npm install` / `npm i` | `pnpm install` |
| `npm i -D <pkg>` | `pnpm add -D <pkg> --filter @altaria/<app>` |
| `npx <bin>` (installed) | `pnpm exec <bin>` |
| `npx <pkg>` (one-off) | `pnpm dlx <pkg>` |
| `npm create <x>` | `pnpm create <x>` |
| `npm run <script>` | `pnpm run <script>` / `pnpm <script>` |

Tool output and third-party docs often suggest npm/npx (e.g. wrangler's hints); translate them to pnpm.

## Monorepo

pnpm workspaces + Turborepo.

- `apps/web` — Astro + React + Tailwind frontend. See [apps/web/AGENTS.md](apps/web/AGENTS.md).
- `apps/api` — Hono API on Cloudflare Workers. See [apps/api/AGENTS.md](apps/api/AGENTS.md).
- `packages/*` — shared internal packages (none yet).

## Commands

Run from the repo root:

| Task | Command |
|------|---------|
| Install dependencies | `pnpm install` |
| Dev (all apps) | `pnpm dev` |
| Dev (one app) | `pnpm turbo run dev --filter=@altaria/web` |
| Build | `pnpm build` |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Deploy API | `pnpm turbo run deploy --filter=@altaria/api` |
| Deploy web | `pnpm turbo run deploy --filter=@altaria/web` |

Add a dependency to one app with `pnpm add <pkg> --filter @altaria/<app>`. Never create a lockfile inside an app; the only lockfile is `pnpm-lock.yaml` at the root.

## Environment variables

Turborepo runs in strict env mode: variables not declared in `turbo.json` (`env` / `globalEnv`) are not passed to tasks. Declare any new build-time variable there.
