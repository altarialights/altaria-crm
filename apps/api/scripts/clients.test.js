import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createClient } from '@libsql/client';
import { Hono } from 'hono';
import { ClientService, CLIENT_STAGES } from '../src/clients/service.ts';
import { createClientRoutes } from '../src/clients/routes.ts';
import { CardService } from '../src/cards/service.ts';
import { applyMigrations } from './migrate.js';
import { requestBodyLimit } from '../src/middleware/body-limit.ts';
import { MAX_IMAGE_BYTES } from '../src/gallery/service.ts';

const { File, Response, FormData } = globalThis;
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const logoFile = () => new File([png], 'logo.jpg', { type: 'image/jpeg' });
class MemoryBucket {
	objects = new Map();
	afterPut;
	failPut = false;
	async put(key, file, options) {
		if (this.failPut) throw new Error('R2 unavailable');
		this.objects.set(key, { bytes: new Uint8Array(await file.arrayBuffer()), options });
		await this.afterPut?.();
		return { key };
	}
	async get(key) { const object = this.objects.get(key); return object ? { body: new Response(object.bytes).body, size: object.bytes.length } : null; }
	async delete(key) { this.objects.delete(key); }
}

async function fixture(t) {
	const db = createClient({ url: 'file::memory:' }); t.after(() => db.close());
	await db.execute('PRAGMA foreign_keys = ON'); await applyMigrations(db);
	const bucket = new MemoryBucket();
	return { db, bucket, service: new ClientService(db, bucket), cards: new CardService(db, 'https://cards.example.com') };
}
const ordered = async (service, stage) => (await service.list({ stage, order: 'position', pageSize: 50 })).clients;

test('client data, default phase, same-name contacts and safe validation', async (t) => {
	const { service } = await fixture(t);
	const client = await service.create({ name: ' Ana ', company: 'Altaria', email: 'ana@example.com', phone: '+34 600 123 123', website: 'https://example.com', notes: 'Primera nota\nSegunda nota' });
	assert.equal(client.name, 'Ana'); assert.equal(client.stage, 'uncontacted'); assert.equal(client.version, 0);
	assert.equal(client.website, 'https://example.com/'); assert.equal(client.notes.includes('\n'), true);
	const sameName = await service.create({ name: 'Ana' }); assert.notEqual(sameName.id, client.id);
	for (const input of [{ name: '' }, { name: 'A', email: 'bad' }, { name: 'A', website: 'javascript:alert(1)' }, { name: 'A', website: 'https://user:pass@example.com' }, { name: 'A', stage: 'bad' }, { name: 'A', notes: 'a'.repeat(5001) }, { name: 'A\nB' }]) await assert.rejects(service.create(input), { status: 400 });
	const changed = await service.update(client.id, { ...client, company: 'Empresa nueva', stage: 'quote_sent' });
	assert.equal(changed.version, 1); assert.equal(changed.stage, 'quote_sent');
	await assert.rejects(service.update(client.id, { ...client, name: 'Stale' }), { status: 409 });
	assert.equal((await service.get(client.id)).name, 'Ana');
});

test('moving between every phase and sorting in a column persists without duplicates', async (t) => {
	const { service } = await fixture(t);
	let a = await service.create({ name: 'A' }); const b = await service.create({ name: 'B' }); const c = await service.create({ name: 'C' });
	a = await service.move(a.id, { stage: 'uncontacted', beforeId: c.id, version: a.version });
	assert.deepEqual((await ordered(service, 'uncontacted')).map((client) => client.name), ['B', 'A', 'C']);
	a = await service.move(a.id, { stage: 'uncontacted', beforeId: b.id, version: a.version });
	assert.deepEqual((await ordered(service, 'uncontacted')).map((client) => client.name), ['A', 'B', 'C']);
	for (const stage of CLIENT_STAGES) {
		a = await service.move(a.id, { stage, version: a.version });
		assert.equal((await service.get(a.id)).stage, stage);
	}
	const board = await service.board();
	assert.equal(board.columns.length, 7); assert.equal(board.columns.reduce((sum, column) => sum + column.total, 0), 3);
	assert.equal(new Set(board.columns.flatMap((column) => column.clients.map((client) => client.id))).size, 3);
	await assert.rejects(service.move(a.id, { stage: 'uncontacted', beforeId: a.id, version: a.version }), { status: 400 });
	await assert.rejects(service.move(a.id, { stage: 'quote_sent', beforeId: b.id, version: a.version }), { status: 409 });
	await assert.rejects(service.move(a.id, { stage: 'bad', version: a.version }), { status: 400 });
	await assert.rejects(service.move(a.id, { stage: 'uncontacted', version: a.version - 1 }), { status: 409 });
	assert.equal((await service.get(a.id)).stage, 'project_finished');
});

test('dense reordering renumbers safely and stale edits cannot undo a move', async (t) => {
	const { service } = await fixture(t);
	const start = await service.create({ name: 'Start' }); const end = await service.create({ name: 'End' });
	for (let index = 0; index < 42; index++) {
		const client = await service.create({ name: `Inserted ${index}` });
		await service.move(client.id, { stage: 'uncontacted', beforeId: end.id, version: client.version });
	}
	const clients = await ordered(service, 'uncontacted');
	assert.equal(clients.length, 44); assert.equal(new Set(clients.map((client) => client.position)).size, 44);
	assert.equal(clients[0].id, start.id); assert.equal(clients.at(-1).id, end.id);
	const moved = await service.move(start.id, { stage: 'first_contact', version: start.version });
	await assert.rejects(service.update(start.id, { ...start, notes: 'Stale note' }), { status: 409 });
	assert.equal((await service.get(start.id)).version, moved.version);
});

test('search filters literal wildcards, pagination reaches all customers and board columns are bounded', async (t) => {
	const { service } = await fixture(t);
	for (let index = 0; index < 26; index++) await service.create({ name: `Cliente ${String(index).padStart(2, '0')}`, company: index === 0 ? 'Oferta 50%_especial' : '', stage: index < 24 ? 'uncontacted' : 'first_contact' });
	const first = await service.list({ pageSize: 20 }); const second = await service.list({ page: 2, pageSize: 20 });
	assert.equal(first.total, 26); assert.equal(new Set([...first.clients, ...second.clients].map((client) => client.id)).size, 26);
	assert.equal((await service.list({ search: '%_' })).total, 1);
	assert.equal((await service.list({ stage: 'first_contact' })).total, 2);
	const column = (await service.board()).columns.find((item) => item.stage === 'uncontacted');
	assert.equal(column.total, 24); assert.equal(column.clients.length, 20);
	assert.equal((await service.list({ stage: 'uncontacted', order: 'position', pageSize: 20, page: 2 })).clients.length, 4);
	for (const pageSize of [0, 51, 1.5, NaN]) await assert.rejects(service.list({ pageSize }), { status: 400 });
	await assert.rejects(service.list({ stage: 'bad' }), { status: 400 });
});

test('cards link to real clients, follow name changes and block accidental client deletion', async (t) => {
	const { service, cards } = await fixture(t);
	const client = await service.create({ name: 'Cliente original' });
	const card = await cards.create({ reference: 'Tarjeta cliente', status: 'active', clientId: client.id, clientName: 'Ignored forged name', targetUrl: 'https://example.com' });
	assert.equal(card.clientId, client.id); assert.equal(card.clientName, client.name);
	const updated = await service.update(client.id, { ...client, name: 'Nombre cambiado' });
	assert.equal((await cards.get(card.id)).clientName, 'Nombre cambiado');
	assert.equal((await cards.list({ search: 'Nombre cambiado' })).total, 1);
	await assert.rejects(service.delete(client.id, updated.version), { status: 409 });
	assert.equal(await cards.destination(card.id), 'https://example.com/');
	await cards.release(card.id); assert.equal((await cards.get(card.id)).clientId, null);
	await service.delete(client.id, updated.version); await assert.rejects(service.get(client.id), { status: 404 });
	await assert.rejects(cards.create({ reference: 'Missing', status: 'active', clientId: randomUUID(), targetUrl: 'https://example.com' }), { status: 400 });
	const legacy = await cards.create({ reference: 'Anterior', status: 'active', clientName: 'Cliente anterior', targetUrl: 'https://example.com' });
	assert.equal(legacy.clientId, null); assert.equal(legacy.clientName, 'Cliente anterior');
});

test('client HTTP routes handle JSON, update conflicts, board, moving and deletion', async (t) => {
	const { db } = await fixture(t);
	const database = () => new Proxy(db, { get(target, key) { return key === 'close' ? () => {} : typeof target[key] === 'function' ? target[key].bind(target) : target[key]; } });
	const app = new Hono().route('/v1/clients', createClientRoutes(database));
	app.onError((error, c) => c.json({ error: error.message }, error.status ?? 500));
	const call = (path = '', init = {}) => app.request(`https://api.example.com/v1/clients${path}`, init);
	const json = (data, method = 'POST') => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
	let response = await call('', json({ name: 'Ana' })); assert.equal(response.status, 201); const client = await response.json();
	assert.equal((await (await call()).json()).total, 1);
	response = await call(`/${client.id}/move`, json({ stage: 'meeting_scheduled', version: client.version })); assert.equal(response.status, 200); const moved = await response.json();
	assert.equal((await (await call('/board')).json()).columns.find((column) => column.stage === 'meeting_scheduled').total, 1);
	assert.equal((await call(`/${client.id}`, json({ ...client, name: 'Stale' }, 'PATCH'))).status, 409);
	assert.equal((await call(`/${client.id}?version=${moved.version}`, { method: 'DELETE' })).status, 200);
	assert.equal((await call(`/${client.id}`)).status, 404);
	assert.equal((await call('', { method: 'POST', body: '{broken' })).status, 400);
	assert.equal((await call('?pageSize=0')).status, 400);
});

test('optional logos: private streaming, safe signatures, replacement, retention, removal and client deletion', async (t) => {
	const { service, bucket, cards } = await fixture(t);
	const plain = await service.create({ name: 'Sin logo' });
	assert.equal(plain.logoUrl, null); await assert.rejects(service.readLogo(plain.id), { status: 404 });
	let client = await service.create({ name: 'Con logo', company: 'Empresa' }, logoFile());
	const [originalKey] = bucket.objects.keys();
	assert.match(originalKey, new RegExp(`^client-logos/${client.id}/[a-f0-9-]{36}\\.png$`));
	assert.match(client.logoUrl, new RegExp(`^/clientes/logo/${client.id}\\?v=`));
	assert.equal(bucket.objects.get(originalKey).options.httpMetadata.contentType, 'image/png');
	assert.equal(JSON.stringify(client).includes('client-logos/'), false);
	const response = await service.readLogo(client.id);
	assert.equal(response.headers.get('Content-Type'), 'image/png'); assert.equal(response.headers.get('Cache-Control'), 'private, no-store'); assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
	assert.deepEqual(new Uint8Array(await response.arrayBuffer()), png);
	const originalUrl = client.logoUrl;
	client = await service.update(client.id, { ...client, name: 'Otro nombre' });
	assert.equal(client.logoUrl, originalUrl); assert.equal(bucket.objects.has(originalKey), true);
	client = await service.move(client.id, { stage: 'quote_sent', version: client.version });
	assert.equal(client.logoUrl, originalUrl);
	assert.equal((await service.board()).columns.find((column) => column.stage === 'quote_sent').clients[0].logoUrl, originalUrl);
	client = await service.update(client.id, { ...client }, logoFile());
	assert.notEqual(client.logoUrl, originalUrl); assert.equal(bucket.objects.has(originalKey), false); assert.equal(bucket.objects.size, 1);
	client = await service.update(client.id, { ...client, removeLogo: true });
	assert.equal(client.logoUrl, null); assert.equal(bucket.objects.size, 0);
	client = await service.update(client.id, { ...client }, logoFile());
	const card = await cards.create({ reference: 'Asignada', status: 'active', clientId: client.id, targetUrl: 'https://example.com' });
	await assert.rejects(service.delete(client.id, client.version), { status: 409 }); assert.equal(bucket.objects.size, 1);
	await cards.release(card.id); await service.delete(client.id, client.version); assert.equal(bucket.objects.size, 0);
});

test('invalid uploads, storage failures, SQL failures and concurrent edits preserve the confirmed client and logo', async (t) => {
	const { db, service, bucket } = await fixture(t);
	for (const [file, status] of [
		[new File([], 'empty.png'), 413],
		[new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'large.png'), 413],
		[new File(['<svg onload="alert(1)"/>'], 'fake.png', { type: 'image/png' }), 415],
	]) await assert.rejects(service.create({ name: 'Invalid' }, file), { status });
	await assert.rejects(service.create({ name: 'Invalid', removeLogo: true }, logoFile()), { status: 400 });
	assert.equal((await service.list({})).total, 0); assert.equal(bucket.objects.size, 0);
	await db.execute("CREATE TRIGGER reject_client BEFORE INSERT ON clients BEGIN SELECT RAISE(ABORT, 'test insert failure'); END");
	await assert.rejects(service.create({ name: 'Rollback' }, logoFile()), /test insert failure/); assert.equal(bucket.objects.size, 0);
	await db.execute('DROP TRIGGER reject_client');
	const client = await service.create({ name: 'Confirmed' }, logoFile());
	const [originalKey] = bucket.objects.keys();
	bucket.failPut = true;
	await assert.rejects(service.update(client.id, { ...client, name: 'Failed' }, logoFile()), /R2 unavailable/);
	assert.equal((await service.get(client.id)).name, 'Confirmed'); assert.equal(bucket.objects.size, 1); bucket.failPut = false;
	await db.execute("CREATE TRIGGER reject_update BEFORE UPDATE ON clients BEGIN SELECT RAISE(ABORT, 'test update failure'); END");
	await assert.rejects(service.update(client.id, { ...client, name: 'Failed' }, logoFile()), /test update failure/);
	assert.equal((await service.get(client.id)).logoUrl, client.logoUrl); assert.equal(bucket.objects.size, 1);
	await db.execute('DROP TRIGGER reject_update');
	bucket.afterPut = async () => { await service.move(client.id, { stage: 'first_contact', version: client.version }); };
	await assert.rejects(service.update(client.id, { ...client, name: 'Stale' }, logoFile()), { status: 409 });
	assert.equal(bucket.objects.size, 1); assert.equal(bucket.objects.has(originalKey), true);
	await assert.rejects(service.update(client.id, { ...client, removeLogo: true }), { status: 409 });
	assert.equal((await service.get(client.id)).logoUrl, client.logoUrl); assert.equal((await service.get(client.id)).stage, 'first_contact');
});

test('multipart client routes accept large logos, enforce file and body limits, and save all changes together', async (t) => {
	const { db, bucket } = await fixture(t);
	const database = () => new Proxy(db, { get(target, key) { return key === 'close' ? () => {} : typeof target[key] === 'function' ? target[key].bind(target) : target[key]; } });
	const app = new Hono().use(requestBodyLimit).route('/v1/clients', createClientRoutes(database));
	app.onError((error, c) => c.json({ error: error.message }, error.status ?? 500));
	const call = (path = '', init = {}) => app.request(`https://api.example.com/v1/clients${path}`, init, { GALLERY_BUCKET: bucket });
	const multipart = (data, file, method = 'POST') => { const body = new FormData(); body.set('data', JSON.stringify(data)); if (file) body.set('logo', file); return { method, body }; };
	let response = await call('', multipart({ name: 'Empresa' }, new File([png, new Uint8Array(2 * 1024 * 1024)], 'logo.png')));
	assert.equal(response.status, 201); let client = await response.json(); assert.ok(client.logoUrl);
	response = await call(`/${client.id}/logo`); assert.equal(response.status, 200); assert.equal(response.headers.get('Content-Type'), 'image/png'); await response.body.cancel();
	response = await call(`/${client.id}`, multipart({ ...client, name: 'Empresa nueva' }, logoFile(), 'PATCH'));
	assert.equal(response.status, 200); client = await response.json(); assert.equal(client.name, 'Empresa nueva'); assert.equal(bucket.objects.size, 1);
	const duplicate = multipart({ ...client }, logoFile(), 'PATCH'); duplicate.body.append('logo', logoFile());
	assert.equal((await call(`/${client.id}`, duplicate)).status, 400);
	assert.equal((await call(`/${client.id}`, multipart({ ...client, name: 'No guardar' }, new File(['bad'], 'fake.png'), 'PATCH'))).status, 415);
	assert.equal((await (await call(`/${client.id}`)).json()).name, 'Empresa nueva');
	assert.equal((await call('', multipart({ name: 'Too large' }, new File([png, new Uint8Array(MAX_IMAGE_BYTES + 100000)], 'large.png')))).status, 413);
	assert.equal((await call('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x'.repeat(1024 * 1024) }) })).status, 413);
	assert.equal((await call(`/${client.id}/move`, multipart({ stage: 'first_contact', version: client.version }, new File([png, new Uint8Array(2 * 1024 * 1024)], 'logo.png')))).status, 413);
	response = await call(`/${client.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...client, removeLogo: true }) });
	assert.equal(response.status, 200); assert.equal((await response.json()).logoUrl, null); assert.equal(bucket.objects.size, 0);
});
