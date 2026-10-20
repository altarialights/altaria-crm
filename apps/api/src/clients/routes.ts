import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createDb } from '../db';
import type { AppEnv } from '../types';
import { ClientService } from './service';

type ClientEnv = AppEnv & { Variables: AppEnv['Variables'] & { clients: ClientService } };
async function json(request: Request): Promise<unknown> {
	try { return await request.json(); } catch { throw new HTTPException(400, { message: 'El contenido JSON no es válido.' }); }
}
async function clientInput(request: Request): Promise<{ input: unknown; file?: File }> {
	if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('multipart/form-data')) return { input: await json(request) };
	let form: FormData;
	try { form = await request.formData(); } catch { throw new HTTPException(400, { message: 'No se pudo leer la ficha del cliente.' }); }
	const data = form.get('data'); const file = form.get('logo');
	if (typeof data !== 'string' || form.getAll('data').length !== 1 || form.getAll('logo').length > 1 || (file !== null && !(file instanceof File))) throw new HTTPException(400, { message: 'Incluye los datos del cliente y, opcionalmente, un único logo.' });
	let input: unknown;
	try { input = JSON.parse(data); } catch { throw new HTTPException(400, { message: 'Los datos del cliente no son válidos.' }); }
	return { input, ...(file instanceof File ? { file } : {}) };
}
export function createClientRoutes(database: typeof createDb = createDb) {
	return new Hono<ClientEnv>()
		.use(async (c, next) => {
			const db = database(c.env); c.set('clients', new ClientService(db, c.env?.GALLERY_BUCKET));
			c.header('Cache-Control', 'private, no-store');
			try { await next(); } finally { db.close(); }
		})
		.get('/', async (c) => c.json(await c.var.clients.list({ search: c.req.query('search'), stage: c.req.query('stage'), order: c.req.query('order'), page: Number(c.req.query('page') ?? 1), pageSize: Number(c.req.query('pageSize') ?? 20) })))
		.get('/board', async (c) => c.json(await c.var.clients.board(c.req.query('search'))))
		.post('/', async (c) => { const { input, file } = await clientInput(c.req.raw); return c.json(await c.var.clients.create(input, file), 201); })
		.get('/:id/logo', async (c) => c.var.clients.readLogo(c.req.param('id')))
		.get('/:id', async (c) => c.json(await c.var.clients.get(c.req.param('id'))))
		.patch('/:id', async (c) => { const { input, file } = await clientInput(c.req.raw); return c.json(await c.var.clients.update(c.req.param('id'), input, file)); })
		.post('/:id/move', async (c) => c.json(await c.var.clients.move(c.req.param('id'), await json(c.req.raw))))
		.delete('/:id', async (c) => { await c.var.clients.delete(c.req.param('id'), Number(c.req.query('version'))); return c.json({ success: true }); });
}
