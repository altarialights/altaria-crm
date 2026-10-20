import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createClient } from '@libsql/client';
import { Hono } from 'hono';
import { CardService } from '../src/cards/service.ts';
import { createCardRoutes, createCardRedirectRoutes } from '../src/cards/routes.ts';
import { applyMigrations } from './migrate.js';

const origin = 'https://cards.example.com';
const free = (reference = 'Tarjeta 001') => ({ reference, status: 'free' });
const assigned = (reference = 'Tarjeta 001', targetUrl = 'https://example.com/contacto') => ({ reference, status: 'active', clientName: 'Cliente privado', targetUrl });
async function fixture(t) {
	const db = createClient({ url: 'file::memory:' }); t.after(() => db.close());
	await db.execute('PRAGMA foreign_keys = ON'); await applyMigrations(db);
	return { db, service: new CardService(db, origin) };
}

test('card identity and QR URL survive assignment, target changes, pause, release and reassignment', async (t) => {
	const { db, service } = await fixture(t);
	const initial = await service.create(free());
	assert.match(initial.id, /^[a-f0-9-]{36}$/); assert.equal(initial.publicUrl, `${origin}/t/${initial.id}`);
	assert.equal(await service.destination(initial.id), null);
	await service.update(initial.id, assigned());
	assert.equal(await service.destination(initial.id), 'https://example.com/contacto');
	await service.update(initial.id, assigned('Tarjeta 001', 'https://example.com/nuevo'));
	assert.equal(await service.destination(initial.id), 'https://example.com/nuevo');
	await service.setStatus(initial.id, 'paused'); assert.equal(await service.destination(initial.id), null);
	await service.setStatus(initial.id, 'active');
	const released = await service.release(initial.id);
	assert.equal(released.clientName, ''); assert.equal(released.targetUrl, ''); assert.equal(released.publicUrl, initial.publicUrl);
	await assert.rejects(service.setStatus(initial.id, 'active'), { status: 409 });
	const differentOrigin = new CardService(db, 'https://new.example.com');
	const reused = await differentOrigin.update(initial.id, assigned('Reutilizada'));
	assert.equal(reused.publicUrl, initial.publicUrl);
	assert.equal((await differentOrigin.create(free('Nueva'))).publicUrl.startsWith('https://new.example.com/'), true);
});

test('validation rejects duplicate references, unsafe URLs, card redirect loops and missing designs', async (t) => {
	const { service } = await fixture(t); const existing = await service.create(free());
	await assert.rejects(service.create(free('tarjeta 001')), { status: 409 });
	for (const target of ['javascript:alert(1)', 'data:text/html,hello', 'ftp://example.com', '/relative', 'https://user:pass@example.com', `${origin}/t/${randomUUID()}`, existing.publicUrl + '?test=1', existing.publicUrl.replace('https:', 'http:'), 'https://example.com\nLocation: bad']) {
		await assert.rejects(service.update(existing.id, assigned('Tarjeta 001', target)), { status: 400 });
	}
	await assert.rejects(service.update(existing.id, { ...assigned(), clientName: '' }), { status: 400 });
	await assert.rejects(service.create({ ...free('Diseño'), designId: randomUUID() }), { status: 400 });
	await assert.rejects(service.create({ ...free(), status: 'other' }), { status: 400 });
	await assert.rejects(service.get(randomUUID()), { status: 404 });
	assert.equal(await service.destination('../bad'), null);
});

test('assigned designs can be removed without losing physical cards or their destinations', async (t) => {
	const { db, service } = await fixture(t); const folderId = randomUUID(); const designId = randomUUID();
	await db.execute({ sql: 'INSERT INTO gallery_folders (id,name,storage_prefix) VALUES (?,?,?)', args: [folderId, 'Pruebas', 'pruebas'] });
	await db.execute({ sql: 'INSERT INTO gallery_images (id,folder_id,name,object_key,original_filename,content_type,size_bytes) VALUES (?,?,?,?,?,?,?)', args: [designId, folderId, 'Diseño', 'pruebas/image.png', 'image.png', 'image/png', 12] });
	const created = await service.create({ ...assigned(), designId });
	assert.equal(created.designName, 'Diseño');
	const released = await service.release(created.id); assert.equal(released.designId, designId);
	await service.update(created.id, { ...assigned(), designId });
	await db.execute({ sql: 'DELETE FROM gallery_images WHERE id = ?', args: [designId] });
	assert.equal((await service.get(created.id)).designId, null);
	assert.equal(await service.destination(created.id), 'https://example.com/contacto');
});

test('card filters, literal wildcard search and pagination reach every record once', async (t) => {
	const { service } = await fixture(t);
	for (let index = 0; index < 13; index++) await service.create(index % 2 ? assigned(`Tarjeta ${index}`) : free(`Tarjeta ${index}`));
	await service.create(free('Oferta 50%_especial'));
	const pages = await Promise.all([1, 2, 3, 4, 5].map((page) => service.list({ page, pageSize: 3 })));
	assert.equal(new Set(pages.flatMap((data) => data.cards.map((card) => card.id))).size, 14);
	assert.equal((await service.list({ status: 'active' })).total, 6);
	assert.equal((await service.list({ search: '%_' })).total, 1);
	for (const pageSize of [0, 51, 1.5, NaN]) await assert.rejects(service.list({ pageSize }), { status: 400 });
	await assert.rejects(service.list({ status: 'unknown' }), { status: 400 });
});

test('public redirects use fresh destinations with 302/no-store and reveal no private data for inactive cards', async (t) => {
	const { db, service } = await fixture(t);
	const database = () => new Proxy(db, { get(target, key) { return key === 'close' ? () => {} : typeof target[key] === 'function' ? target[key].bind(target) : target[key]; } });
	const app = new Hono().route('/t', createCardRedirectRoutes(database));
	const env = { CARD_PUBLIC_ORIGIN: origin };
	const created = await service.create(assigned());
	const scan = (method = 'GET') => app.request(`${origin}/t/${created.id}`, { method }, env);
	let response = await scan();
	assert.equal(response.status, 302); assert.equal(response.headers.get('Location'), 'https://example.com/contacto');
	assert.equal(response.headers.get('Cache-Control'), 'no-store'); assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
	assert.equal((await scan('HEAD')).status, 302);
	await service.update(created.id, assigned('Tarjeta 001', 'https://example.com/segundo'));
	assert.equal((await scan()).headers.get('Location'), 'https://example.com/segundo');
	await service.setStatus(created.id, 'paused'); response = await scan();
	assert.equal(response.status, 404); assert.equal(response.headers.get('Cache-Control'), 'no-store');
	const html = await response.text(); assert.equal(html.includes('Cliente privado'), false); assert.equal(html.includes('example.com'), false);
	await service.release(created.id); assert.equal((await scan()).status, 404);
	assert.equal((await app.request(`${origin}/t/not-an-id`, {}, env)).status, 404);
});

test('management HTTP routes handle create, edit, filters, state, release and invalid JSON', async (t) => {
	const { db } = await fixture(t);
	const database = () => new Proxy(db, { get(target, key) { return key === 'close' ? () => {} : typeof target[key] === 'function' ? target[key].bind(target) : target[key]; } });
	const app = new Hono().route('/v1/cards', createCardRoutes(database));
	app.onError((error, c) => c.json({ error: error.message }, error.status ?? 500));
	const call = (path = '', init = {}) => app.request(`https://api.example.com/v1/cards${path}`, init, { CARD_PUBLIC_ORIGIN: origin });
	const body = (data, method = 'POST') => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
	const response = await call('', body(free())); assert.equal(response.status, 201); const card = await response.json();
	assert.equal((await (await call()).json()).total, 1);
	assert.equal((await call(`/${card.id}`, body(assigned(), 'PATCH'))).status, 200);
	assert.equal((await call(`/${card.id}/status`, body({ status: 'paused' }))).status, 200);
	assert.equal((await (await call('?status=paused')).json()).total, 1);
	assert.equal((await call(`/${card.id}/release`, { method: 'POST' })).status, 200);
	assert.equal((await (await call(`/${card.id}`)).json()).status, 'free');
	assert.equal((await call('', { method: 'POST', body: '{bad' })).status, 400);
	assert.equal((await call('?pageSize=0')).status, 400);
});
