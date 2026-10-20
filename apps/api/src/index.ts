import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { createDb } from './db';
import { galleryRoutes } from './gallery/routes';
import { createCardRoutes, createCardRedirectRoutes } from './cards/routes';
import { createClientRoutes } from './clients/routes';
import { createFinanceRoutes } from './finance/routes';
import { FinanceService } from './finance/service';
import { parseOrigins } from './lib/origins';
import { requireAuth } from './middleware/auth';
import { requestBodyLimit } from './middleware/body-limit';
import type { AppEnv } from './types';

// Everything under /v1 requires a signed-in Clerk user
const v1 = new Hono<AppEnv>()
	.use(requireAuth)
	.use(requestBodyLimit)
	.route('/gallery', galleryRoutes)
	.route('/cards', createCardRoutes())
	.route('/clients', createClientRoutes())
	.route('/finance', createFinanceRoutes())
	.get('/me', (c) => c.json(c.var.auth))
	.get('/db/health', async (c) => {
		const startedAt = Date.now();
		await createDb(c.env).execute('SELECT 1');
		return c.json({ status: 'ok', latencyMs: Date.now() - startedAt });
	});

const app = new Hono<AppEnv>()
	.use(secureHeaders())
	.use(
		cors({
			origin: parseOrigins(env.WEB_ORIGINS),
			allowHeaders: ['Authorization', 'Content-Type'],
			allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
			maxAge: 600,
		}),
	)
	.get('/health', (c) => c.json({ status: 'ok' }))
	.route('/t', createCardRedirectRoutes())
	.route('/v1', v1);

app.notFound((c) => c.json({ error: 'Not Found' }, 404));

app.onError((err, c) => {
	if (err instanceof HTTPException) {
		return c.json({ error: err.message }, err.status);
	}
	console.error(JSON.stringify({ message: 'unhandled error', error: err.message, path: c.req.path }));
	return c.json({ error: 'Internal Server Error' }, 500);
});

export type AppType = typeof app;

export default {
	fetch: app.fetch,
	async scheduled(_controller, bindings) {
		const db = createDb(bindings);
		try {
			const generated = await new FinanceService(db, bindings.GALLERY_BUCKET).syncDue();
			console.log(JSON.stringify({ message: 'finance recurrence generation completed', generated }));
		} catch (cause) {
			console.error(JSON.stringify({ message: 'finance recurrence generation failed', error: cause instanceof Error ? cause.message : 'Unknown error' }));
			throw cause;
		} finally { db.close(); }
	},
} satisfies ExportedHandler<CloudflareBindings>;
