import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono<{ Bindings: CloudflareBindings }>()
	.use('*', cors({ origin: env.CORS_ORIGINS.split(',') }))
	.get('/health', (c) => c.json({ status: 'ok' }));

export type AppType = typeof app;

export default app;
