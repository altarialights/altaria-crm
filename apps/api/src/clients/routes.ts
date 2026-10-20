import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createDb } from '../db';
import type { AppEnv } from '../types';
import { ClientService } from './service';

type ClientEnv = AppEnv & { Variables: AppEnv['Variables'] & { clients: ClientService } };
async function json(request: Request): Promise<unknown> {
	try { return await request.json(); } catch { throw new HTTPException(400, { message: 'El contenido JSON no es válido.' }); }
}
export function createClientRoutes(database: typeof createDb = createDb) {
	return new Hono<ClientEnv>()
		.use(async (c, next) => {
			const db = database(c.env); c.set('clients', new ClientService(db));
			c.header('Cache-Control', 'private, no-store');
			try { await next(); } finally { db.close(); }
		})
		.get('/', async (c) => c.json(await c.var.clients.list({ search: c.req.query('search'), stage: c.req.query('stage'), order: c.req.query('order'), page: Number(c.req.query('page') ?? 1), pageSize: Number(c.req.query('pageSize') ?? 20) })))
		.get('/board', async (c) => c.json(await c.var.clients.board(c.req.query('search'))))
		.post('/', async (c) => c.json(await c.var.clients.create(await json(c.req.raw)), 201))
		.get('/:id', async (c) => c.json(await c.var.clients.get(c.req.param('id'))))
		.patch('/:id', async (c) => c.json(await c.var.clients.update(c.req.param('id'), await json(c.req.raw))))
		.post('/:id/move', async (c) => c.json(await c.var.clients.move(c.req.param('id'), await json(c.req.raw))))
		.delete('/:id', async (c) => { await c.var.clients.delete(c.req.param('id'), Number(c.req.query('version'))); return c.json({ success: true }); });
}
