import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createClient } from '@libsql/client';
import { Hono } from 'hono';
import { ClientService, CLIENT_STAGES } from '../src/clients/service.ts';
import { createClientRoutes } from '../src/clients/routes.ts';
import { CardService } from '../src/cards/service.ts';
import { applyMigrations } from './migrate.js';

async function fixture(t) {
	const db = createClient({ url: 'file::memory:' }); t.after(() => db.close());
	await db.execute('PRAGMA foreign_keys = ON'); await applyMigrations(db);
	return { db, service: new ClientService(db), cards: new CardService(db, 'https://cards.example.com') };
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
