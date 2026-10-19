import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { Hono } from 'hono';
import { GalleryService, MAX_IMAGE_BYTES } from '../src/gallery/service.ts';
import { createGalleryRoutes } from '../src/gallery/routes.ts';
import { requestBodyLimit } from '../src/middleware/body-limit.ts';
import { applyMigrations } from './migrate.js';

const { File, Response, FormData } = globalThis;

const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const pngFile = (name = 'Diseño.png') => new File([png], name, { type: 'image/png' });
class MemoryBucket {
	objects = new Map();
	failDelete = false;
	afterPut;
	async put(key, stream, options) {
		const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
		this.objects.set(key, { bytes, options });
		await this.afterPut?.();
		return { key };
	}
	async get(key) {
		const entry = this.objects.get(key);
		return entry ? { body: new Response(entry.bytes).body, size: entry.bytes.length } : null;
	}
	async delete(key) { if (this.failDelete) throw new Error('R2 unavailable'); this.objects.delete(key); }
}
async function fixture(t) {
	const db = createClient({ url: 'file::memory:' });
	t.after(() => db.close());
	await db.execute('PRAGMA foreign_keys = ON');
	await applyMigrations(db);
	const bucket = new MemoryBucket();
	return { db, bucket, service: new GalleryService(db, bucket) };
}

test('folders: empty categories, duplicate names, slug collisions, stable prefixes and deletion', async (t) => {
	const { service } = await fixture(t);
	const folder = await service.createFolder('  Restaurantes  ');
	assert.equal(folder.storagePrefix, 'restaurantes');
	assert.equal((await service.listFolders())[0].imageCount, 0);
	await assert.rejects(service.createFolder('restaurantes'), { status: 409 });
	await assert.rejects(service.createFolder(' '), { status: 400 });
	const accented = await service.createFolder('Restaurántes');
	assert.match(accented.storagePrefix, /^restaurantes-[a-f0-9]{8}$/);
	await service.renameFolder(folder.id, 'Identificación personal');
	assert.equal((await service.listFolders()).find((entry) => entry.id === folder.id).storagePrefix, 'restaurantes');
	await service.deleteFolder(folder.id);
	await assert.rejects(service.deleteFolder(folder.id), { status: 404 });
});

test('upload: UUID object names, detected MIME, private byte-for-byte reads and renames', async (t) => {
	const { service, bucket } = await fixture(t);
	const folder = await service.createFolder('Peluquerías');
	const created = await service.upload(folder.id, new File([png], 'Tarjeta única.jpg', { type: 'image/jpeg' }));
	const [key] = bucket.objects.keys();
	assert.match(key, /^peluquerias\/[a-f0-9-]{36}\.png$/);
	assert.equal(bucket.objects.get(key).options.httpMetadata.contentType, 'image/png');
	const response = await service.readImage(created.id);
	assert.equal(response.headers.get('Content-Type'), 'image/png');
	assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
	assert.deepEqual(new Uint8Array(await response.arrayBuffer()), png);
	await service.renameFolder(folder.id, 'Salones');
	await service.renameImage(created.id, 'Diseño personalizado');
	const listing = await service.listImages({ folderId: folder.id });
	assert.equal(listing.images[0].folderName, 'Salones');
	assert.equal(listing.images[0].name, 'Diseño personalizado');
	assert.equal((await service.listFolders())[0].imageCount, 1);
	assert.equal(bucket.objects.has(key), true);
	await assert.rejects(service.deleteFolder(folder.id), { status: 409 });
	await service.deleteImage(created.id);
	assert.equal(bucket.objects.size, 0);
	assert.equal((await service.listImages({})).total, 0);
});

test('uploads reject invalid IDs, SVG disguised as PNG, oversized and empty files', async (t) => {
	const { service, bucket } = await fixture(t);
	const folder = await service.createFolder('Pruebas');
	await assert.rejects(service.upload('../outside', pngFile()), { status: 400 });
	await assert.rejects(service.upload(folder.id, new File(['<svg onload="alert(1)"/>'], 'fake.png', { type: 'image/png' })), { status: 415 });
	await assert.rejects(service.upload(folder.id, new File([], 'empty.png')), { status: 413 });
	await assert.rejects(service.upload(folder.id, new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'huge.png')), { status: 413 });
	await assert.rejects(service.upload(randomUUID(), pngFile()), { status: 404 });
	assert.equal(bucket.objects.size, 0);
	assert.equal((await service.listImages({})).total, 0);
});

test('SQL failure after upload compensates by removing the R2 object', async (t) => {
	const { db, bucket, service } = await fixture(t);
	const folder = await service.createFolder('Temporal');
	bucket.afterPut = () => db.execute({ sql: 'DELETE FROM gallery_folders WHERE id = ?', args: [folder.id] });
	await assert.rejects(service.upload(folder.id, pngFile()), /FOREIGN KEY/);
	assert.equal(bucket.objects.size, 0);
	assert.equal((await service.listImages({})).total, 0);
});

test('R2 deletion failure preserves metadata and can be retried', async (t) => {
	const { bucket, service } = await fixture(t);
	const folder = await service.createFolder('Restaurantes');
	const uploaded = await service.upload(folder.id, pngFile());
	bucket.failDelete = true;
	await assert.rejects(service.deleteImage(uploaded.id), /R2 unavailable/);
	assert.equal((await service.listImages({})).total, 1);
	bucket.failDelete = false;
	await service.deleteImage(uploaded.id);
	assert.equal((await service.listImages({})).total, 0);
});

test('image pagination is deterministic and search treats SQL wildcards as literal text', async (t) => {
	const { db, service } = await fixture(t);
	const folder = await service.createFolder('Restaurantes');
	await db.batch(Array.from({ length: 27 }, (_, index) => ({
		sql: 'INSERT INTO gallery_images (id, folder_id, name, object_key, original_filename, content_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?)',
		args: [randomUUID(), folder.id, index === 0 ? 'Oferta 50%_especial' : `Diseño ${index}`, `restaurantes/${index}.png`, 'file.png', 'image/png', 12],
	})), 'write');
	const first = await service.listImages({ page: 1 });
	const second = await service.listImages({ page: 2 });
	assert.equal(first.images.length, 24); assert.equal(second.images.length, 3);
	assert.equal(new Set([...first.images, ...second.images].map((image) => image.id)).size, 27);
	assert.equal((await service.listImages({ search: '%_' })).total, 1);
	assert.equal((await service.listImages({ folderId: randomUUID() })).total, 0);
	await assert.rejects(service.listImages({ page: -1 }), { status: 400 });
});

test('HTTP gallery routes: multipart upload, JSON errors, content streaming and deletion', async (t) => {
	const { db, bucket } = await fixture(t);
	// Requests share this in-memory DB; the fixture owns its final close.
	const database = () => new Proxy(db, { get(target, key) {
		if (key === 'close') return () => {};
		return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
	} });
	const app = new Hono().use(requestBodyLimit).route('/v1/gallery', createGalleryRoutes(database));
	app.onError((error, c) => c.json({ error: error.message }, error.status ?? 500));
	const env = { GALLERY_BUCKET: bucket };
	const call = (path, init) => app.request(`http://test/v1/gallery${path}`, init, env);
	const created = await call('/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Restaurantes' }) });
	assert.equal(created.status, 201); const folder = await created.json();
	const bad = await call('/folders', { method: 'POST', body: '{broken' }); assert.equal(bad.status, 400);
	const body = new FormData(); body.set('file', pngFile());
	const upload = await call(`/folders/${folder.id}/images`, { method: 'POST', body });
	assert.equal(upload.status, 201); const image = await upload.json();
	const content = await call(`/images/${image.id}/file`); assert.equal(content.status, 200);
	assert.deepEqual(new Uint8Array(await content.arrayBuffer()), png);
	assert.equal((await call(`/images/${image.id}`, { method: 'DELETE' })).status, 200);
	assert.equal((await call(`/images/${image.id}/file`)).status, 404);
	// The old global 1 MB budget must not block valid photo uploads.
	const largeBody = new FormData(); largeBody.set('file', new File([png, new Uint8Array(2 * 1024 * 1024)], 'large.png'));
	const large = await call(`/folders/${folder.id}/images`, { method: 'POST', body: largeBody });
	assert.equal(large.status, 201); const largeImage = await large.json();
	assert.equal((await call(`/images/${largeImage.id}`, { method: 'DELETE' })).status, 200);
	const oversized = new FormData(); oversized.set('file', new File([new Uint8Array(11 * 1024 * 1024)], 'huge.png'));
	assert.equal((await call(`/folders/${folder.id}/images`, { method: 'POST', body: oversized })).status, 413);
	assert.equal((await call('/folders', { method: 'POST', body: 'x'.repeat(1024 * 1024 + 1) })).status, 413);
	assert.equal((await call(`/folders/${folder.id}`, { method: 'DELETE' })).status, 200);
});
