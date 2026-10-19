import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createDb } from '../db';
import type { AppEnv } from '../types';
import { GalleryService } from './service';

type GalleryEnv = AppEnv & { Variables: AppEnv['Variables'] & { gallery: GalleryService } };

async function readName(request: Request): Promise<unknown> {
	let body: unknown;
	try { body = await request.json(); } catch { throw new HTTPException(400, { message: 'El contenido JSON no es válido.' }); }
	return body && typeof body === 'object' && 'name' in body ? body.name : undefined;
}

// Mounted only under /v1: Clerk authentication and request limits run before these handlers.
export function createGalleryRoutes(database: typeof createDb = createDb) {
	return new Hono<GalleryEnv>()
	.use(async (c, next) => {
		const db = database(c.env);
		c.set('gallery', new GalleryService(db, c.env.GALLERY_BUCKET));
		c.header('Cache-Control', 'private, no-store');
		try { await next(); } finally { db.close(); }
	})
	.get('/folders', async (c) => c.json({ folders: await c.var.gallery.listFolders() }))
	.post('/folders', async (c) => c.json(await c.var.gallery.createFolder(await readName(c.req.raw)), 201))
	.patch('/folders/:id', async (c) => c.json(await c.var.gallery.renameFolder(c.req.param('id'), await readName(c.req.raw))))
	.delete('/folders/:id', async (c) => { await c.var.gallery.deleteFolder(c.req.param('id')); return c.json({ success: true }); })
	.get('/images', async (c) => c.json(await c.var.gallery.listImages({ folderId: c.req.query('folderId'), search: c.req.query('search'), page: Number(c.req.query('page') ?? 1) })))
	.post('/folders/:id/images', async (c) => {
		let form: FormData;
		try { form = await c.req.formData(); } catch { throw new HTTPException(400, { message: 'No se pudo leer el archivo.' }); }
		const file = form.get('file');
		if (!(file instanceof File) || form.getAll('file').length !== 1) throw new HTTPException(400, { message: 'Selecciona una imagen por petición.' });
		return c.json(await c.var.gallery.upload(c.req.param('id'), file), 201);
	})
	.patch('/images/:id', async (c) => c.json(await c.var.gallery.renameImage(c.req.param('id'), await readName(c.req.raw))))
	.get('/images/:id/file', async (c) => c.var.gallery.readImage(c.req.param('id')))
	.delete('/images/:id', async (c) => { await c.var.gallery.deleteImage(c.req.param('id')); return c.json({ success: true }); });
}

export const galleryRoutes = createGalleryRoutes();
