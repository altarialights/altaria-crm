import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createDb } from '../db';
import type { AppEnv } from '../types';
import { CardService } from './service';

type CardEnv = AppEnv & { Variables: AppEnv['Variables'] & { cards: CardService } };
async function json(request: Request): Promise<unknown> {
	try { return await request.json(); } catch { throw new HTTPException(400, { message: 'El contenido JSON no es válido.' }); }
}
export function createCardRoutes(database: typeof createDb = createDb) {
	return new Hono<CardEnv>()
		.use(async (c, next) => {
			const db = database(c.env); c.set('cards', new CardService(db, c.env.CARD_PUBLIC_ORIGIN));
			c.header('Cache-Control', 'private, no-store');
			try { await next(); } finally { db.close(); }
		})
		.get('/', async (c) => c.json(await c.var.cards.list({ search: c.req.query('search'), status: c.req.query('status'), page: Number(c.req.query('page') ?? 1), pageSize: Number(c.req.query('pageSize') ?? 10) })))
		.post('/', async (c) => c.json(await c.var.cards.create(await json(c.req.raw)), 201))
		.get('/:id', async (c) => c.json(await c.var.cards.get(c.req.param('id'))))
		.patch('/:id', async (c) => c.json(await c.var.cards.update(c.req.param('id'), await json(c.req.raw))))
		.post('/:id/status', async (c) => {
			const data = await json(c.req.raw);
			return c.json(await c.var.cards.setStatus(c.req.param('id'), data && typeof data === 'object' && 'status' in data ? data.status : undefined));
		})
		.post('/:id/release', async (c) => c.json(await c.var.cards.release(c.req.param('id'))));
}
export function createCardRedirectRoutes(database: typeof createDb = createDb) {
	return new Hono<AppEnv>().get('/:id', async (c) => {
		c.header('Cache-Control', 'no-store');
		c.header('Referrer-Policy', 'no-referrer');
		const db = database(c.env);
		try {
			const destination = await new CardService(db, c.env.CARD_PUBLIC_ORIGIN).destination(c.req.param('id'));
			if (destination) return c.redirect(destination, 302);
			return c.html('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex,nofollow"><title>Tarjeta no disponible · Altaria</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#f3f9fd;color:#0f2c56;font:16px system-ui}main{max-width:28rem;padding:2rem;text-align:center}p{color:#42556a;line-height:1.6}</style></head><body><main><h1>Tarjeta no disponible</h1><p>Esta tarjeta no tiene un destino activo en este momento. Contacta con quien te la facilitó.</p></main></body></html>', 404);
		} finally { db.close(); }
	});
}
