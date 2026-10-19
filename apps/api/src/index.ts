import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { createDb } from './db';
import { parseOrigins } from './lib/origins';
import { requireAuth } from './middleware/auth';
import type { AppEnv } from './types';

// Everything under /v1 requires a signed-in Clerk user
const v1 = new Hono<AppEnv>()
	.use(requireAuth)
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
	.use(bodyLimit({ maxSize: 1024 * 1024 }))
	.get('/health', (c) => c.json({ status: 'ok' }))
	.route('/v1', v1);

app.notFound((c) => c.json({ error: 'Not Found' }, 404));

app.onError((err, c) => {
	if (err instanceof HTTPException) {
		return err.getResponse();
	}
	console.error(JSON.stringify({ message: 'unhandled error', error: err.message, path: c.req.path }));
	return c.json({ error: 'Internal Server Error' }, 500);
});

export type AppType = typeof app;

export default app;
