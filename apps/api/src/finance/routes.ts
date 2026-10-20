import { Hono } from 'hono';
import { createDb } from '../db';
import type { AppEnv } from '../types';
import { FinanceService, type Filters } from './service';
import { bad } from './validation';

type FinanceEnv = AppEnv & { Variables: AppEnv['Variables'] & { finance: FinanceService } };
async function json(request: Request): Promise<unknown> { try { return await request.json(); } catch { return bad('El contenido JSON no es válido.'); } }
async function input(request: Request): Promise<{ data: unknown; file?: File }> {
	if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('multipart/form-data')) return { data: await json(request) };
	let form: FormData; try { form = await request.formData(); } catch { return bad('No se pudo leer el justificante.'); }
	const data = form.get('data'); const file = form.get('attachment');
	if (typeof data !== 'string' || form.getAll('data').length !== 1 || form.getAll('attachment').length > 1 || (file !== null && !(file instanceof File))) bad('Incluye los datos y, opcionalmente, un único justificante.');
	let parsed: unknown; try { parsed = JSON.parse(data); } catch { return bad('Los datos del movimiento no son válidos.'); }
	return { data: parsed, ...(file instanceof File ? { file } : {}) };
}
function filters(query: Record<string, string>): Filters { return { ...query, page: Number(query.page ?? 1), pageSize: Number(query.pageSize ?? 20) }; }
export function createFinanceRoutes(database: typeof createDb = createDb) {
	return new Hono<FinanceEnv>()
		.use(async (c, next) => {
			const db = database(c.env); c.set('finance', new FinanceService(db, c.env?.GALLERY_BUCKET)); c.header('Cache-Control', 'private, no-store');
			try { await next(); } finally { db.close(); }
		})
		.get('/categories', async (c) => c.json({ categories: await c.var.finance.categories(c.req.query('kind')) }))
		.post('/categories', async (c) => c.json(await c.var.finance.saveCategory(await json(c.req.raw)), 201))
		.patch('/categories/:id', async (c) => c.json(await c.var.finance.saveCategory(await json(c.req.raw), c.req.param('id'))))
		.delete('/categories/:id', async (c) => { await c.var.finance.deleteCategory(c.req.param('id'), Number(c.req.query('version'))); return c.json({ success: true }); })
		.get('/series', async (c) => { await c.var.finance.syncDue(); return c.json(await c.var.finance.listSeries(filters(c.req.query()))); })
		.patch('/series/:id', async (c) => c.json(await c.var.finance.updateSeries(c.req.param('id'), await json(c.req.raw))))
		.post('/series/:id/cancel', async (c) => { await c.var.finance.cancelSeries(c.req.param('id'), Number(c.req.query('version'))); return c.json({ success: true }); })
		.get('/entries', async (c) => { await c.var.finance.syncDue(); return c.json(await c.var.finance.list(filters(c.req.query()))); })
		.post('/entries', async (c) => { const data = await input(c.req.raw); return c.json(await c.var.finance.create(data.data, data.file), 201); })
		.get('/entries/:id', async (c) => c.json(await c.var.finance.get(c.req.param('id'))))
		.get('/entries/:id/file', async (c) => c.var.finance.readAttachment(c.req.param('id')))
		.patch('/entries/:id', async (c) => { const data = await input(c.req.raw); return c.json(await c.var.finance.update(c.req.param('id'), data.data, data.file)); })
		.delete('/entries/:id', async (c) => { await c.var.finance.remove(c.req.param('id'), Number(c.req.query('version'))); return c.json({ success: true }); });
}
