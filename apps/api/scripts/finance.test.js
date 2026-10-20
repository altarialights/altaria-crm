import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@libsql/client';
import { Hono } from 'hono';
import { FinanceService } from '../src/finance/service.ts';
import { nextDue, today } from '../src/finance/validation.ts';
import { createFinanceRoutes } from '../src/finance/routes.ts';
import { ClientService } from '../src/clients/service.ts';
import { requestBodyLimit } from '../src/middleware/body-limit.ts';
import { applyMigrations } from './migrate.js';

const { File, Response, FormData } = globalThis;
const pdf = () => new File(['%PDF-1.7\nTest receipt'], 'Recibo único.pdf', { type: 'application/pdf' });
class MemoryBucket {
	objects = new Map(); afterPut; failPut = false;
	async put(key, file, options) { if (this.failPut) throw new Error('R2 unavailable'); this.objects.set(key, { bytes: new Uint8Array(await file.arrayBuffer()), options }); await this.afterPut?.(); return { key }; }
	async get(key) { const item = this.objects.get(key); return item ? { body: new Response(item.bytes).body, size: item.bytes.length } : null; }
	async delete(key) { this.objects.delete(key); }
}
async function fixture(t) {
	const db = createClient({ url: 'file::memory:' }); t.after(() => db.close()); await db.execute('PRAGMA foreign_keys=ON'); await applyMigrations(db);
	const bucket = new MemoryBucket(); let day = '2026-10-20';
	return { db, bucket, service: new FinanceService(db, bucket, () => day), clients: new ClientService(db, bucket), setDay: (value) => { day = value; } };
}
const input = (extra = {}) => ({ kind: 'income', concept: 'Diseño de tarjetas', amountCents: 12345, dueOn: '2026-10-20', status: 'pending', ...extra });

test('money, business dates, linked clients/categories, status and optimistic updates are validated', async (t) => {
	const { service, clients } = await fixture(t); const client = await clients.create({ name: 'Ana' }); const category = (await service.categories('income'))[0];
	const entry = await service.create(input({ clientId: client.id, categoryId: category.id })); assert.equal(entry.amountCents, 12345); assert.equal(entry.clientName, 'Ana'); assert.equal(entry.categoryName, category.name);
	await clients.update(client.id, { ...client, name: 'Nombre actual' }); assert.equal((await service.get(entry.id)).clientName, 'Nombre actual');
	await assert.rejects(clients.delete(client.id, 1), { status: 409 });
	for (const patch of [{ amountCents: 1.5 }, { amountCents: 0 }, { amountCents: -1 }, { amountCents: 1e10 }, { concept: '' }, { kind: 'bad' }, { dueOn: '2026-02-30' }, { dueOn: '2026-13-01' }, { status: 'settled' }, { status: 'settled', paidOn: '2026-10-21' }, { categoryId: (await service.categories('expense'))[0].id }, { recurrence: { frequency: 'daily' } }, { recurrence: { frequency: 'monthly', endsOn: '2026-10-19' } }]) await assert.rejects(service.create(input(patch)), { status: 400 });
	const changed = await service.update(entry.id, { ...entry, status: 'settled', paidOn: '2026-10-19' }); assert.equal(changed.version, 1); assert.equal(changed.paidOn, '2026-10-19');
	await assert.rejects(service.update(entry.id, { ...entry }), { status: 409 }); await assert.rejects(service.remove(entry.id, 0), { status: 409 });
	assert.equal(today(new Date('2026-10-19T22:30:00Z')), '2026-10-20');
	assert.equal(today(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
});

test('monthly, quarterly and yearly schedules preserve the anchor day and generate pending occurrences once', async (t) => {
	const { service } = await fixture(t);
	assert.equal(nextDue('2024-01-31', 'monthly', 31), '2024-02-29'); assert.equal(nextDue('2024-02-29', 'monthly', 31), '2024-03-31');
	assert.equal(nextDue('2026-11-30', 'quarterly', 30), '2027-02-28'); assert.equal(nextDue('2027-02-28', 'quarterly', 30), '2027-05-30');
	let leap = '2024-02-29'; for (let i = 0; i < 4; i++) leap = nextDue(leap, 'yearly', 29); assert.equal(leap, '2028-02-29');
	const first = await service.create(input({ dueOn: '2026-01-31', status: 'settled', paidOn: '2026-01-31', recurrence: { frequency: 'monthly', endsOn: '2026-04-30' } }));
	assert.ok(first.seriesId); assert.equal(await service.syncDue(), 3); assert.equal(await service.syncDue(), 0);
	const entries = (await service.list({ pageSize: 50 })).entries;
	assert.deepEqual(entries.map((item) => item.dueOn), ['2026-04-30', '2026-03-31', '2026-02-28', '2026-01-31']);
	assert.equal(entries.filter((item) => item.status === 'settled').length, 1); assert.equal(entries.filter((item) => item.status === 'pending').length, 3);
	assert.equal((await service.listSeries({})).series[0].state, 'completed');
	await service.create(input({ concept: 'Quarterly', dueOn: '2026-01-31', recurrence: { frequency: 'quarterly', endsOn: '2026-07-31' } }));
	await service.create(input({ concept: 'Yearly', dueOn: '2024-02-29', recurrence: { frequency: 'yearly', endsOn: '2026-02-28' } }));
	assert.equal(await service.syncDue(), 4); assert.equal((await service.list({ search: 'Yearly' })).total, 3);
});

test('simultaneous catch-up, deleted installments and long backlogs cannot duplicate occurrences', async (t) => {
	const { service, setDay, db } = await fixture(t);
	await service.create(input({ dueOn: '2000-01-31', recurrence: { frequency: 'monthly' } }));
	await Promise.all([service.syncDue(), service.syncDue()]);
	assert.equal((await service.list({})).total, 321);
	const current = (await service.list({ pageSize: 1 })).entries[0]; await service.remove(current.id, current.version);
	assert.equal(await service.syncDue(), 0); assert.equal((await service.list({})).total, 320);
	setDay('2026-11-30'); assert.equal(await service.syncDue(), 2); assert.equal((await service.list({})).total, 322);
	assert.equal((await db.execute('SELECT count(*) AS total FROM finance_entries')).rows[0].total, 323);
});

test('editing and cancelling a recurrence affects new installments and preserves saved history', async (t) => {
	const { service, setDay } = await fixture(t);
	const first = await service.create(input({ dueOn: '2026-10-01', recurrence: { frequency: 'monthly' } })); let schedule = (await service.listSeries({})).series[0];
	schedule = await service.updateSeries(schedule.id, { ...schedule, concept: 'Nuevo precio', amountCents: 25000 });
	assert.equal((await service.get(first.id)).amountCents, 12345);
	setDay('2026-11-01'); await service.syncDue(); const next = (await service.list({})).entries[0]; assert.equal(next.amountCents, 25000); assert.equal(next.concept, 'Nuevo precio');
	await assert.rejects(service.updateSeries(schedule.id, { ...schedule, amountCents: 1 }), { status: 409 });
	schedule = (await service.listSeries({})).series[0]; await service.cancelSeries(schedule.id, schedule.version);
	setDay('2027-12-01'); assert.equal(await service.syncDue(), 0); assert.equal((await service.list({})).total, 2);
	assert.equal((await service.listSeries({})).series[0].state, 'cancelled');
	await assert.rejects(service.updateSeries(schedule.id, { ...schedule, version: schedule.version + 1 }), { status: 409 });
	await service.remove(first.id, first.version); assert.equal((await service.list({})).total, 1);
});

test('a failed generation batch rolls back installments and its cursor, while cancellation wins over a stale generation plan', async (t) => {
	const { service, db } = await fixture(t);
	const first = await service.create(input({ dueOn: '2026-01-31', recurrence: { frequency: 'monthly', endsOn: '2026-04-30' } }));
	await db.execute("CREATE TRIGGER fail_occurrence BEFORE INSERT ON finance_entries WHEN NEW.occurrence_index=2 BEGIN SELECT RAISE(ABORT,'Generation failure'); END");
	await assert.rejects(service.syncDue(), /Generation failure/);
	assert.equal((await service.list({})).total, 1); assert.equal((await service.listSeries({})).series[0].nextDueOn, '2026-02-28');
	await db.execute('DROP TRIGGER fail_occurrence'); assert.equal(await service.syncDue(), 3);
	const later = await service.create(input({ concept: 'Cancel race', dueOn: '2026-01-01', recurrence: { frequency: 'monthly' } }));
	let intercepted = false;
	const racingDb = new Proxy(db, { get(target, key) {
		if (key === 'batch') return async (statements, mode) => {
			if (!intercepted && mode === 'write') { intercepted = true; await target.execute({ sql: 'UPDATE finance_series SET active=0,version=version+1 WHERE id=?', args: [later.seriesId] }); }
			return target.batch(statements, mode);
		};
		return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
	} });
	assert.equal(await new FinanceService(racingDb, undefined, () => '2026-10-20').syncDue(), 0);
	assert.equal((await service.list({ search: 'Cancel race' })).total, 1); assert.equal((await service.get(first.id)).seriesId, first.seriesId);
});

test('frequency changes and extending completed schedules only schedule future dates', async (t) => {
	const { service, setDay } = await fixture(t);
	const first = await service.create(input({ dueOn: '2026-01-31', recurrence: { frequency: 'yearly' } }));
	let schedule = (await service.listSeries({})).series[0];
	schedule = await service.updateSeries(schedule.id, { ...schedule, frequency: 'monthly', amountCents: 25000 });
	assert.equal(schedule.nextDueOn, '2026-10-31'); assert.equal(await service.syncDue(), 0); assert.equal((await service.list({})).total, 1);
	setDay('2026-10-31'); assert.equal(await service.syncDue(), 1); assert.equal((await service.list({})).entries[0].amountCents, 25000); assert.equal((await service.get(first.id)).amountCents, 12345);
	await service.create(input({ concept: 'Extend', dueOn: '2026-01-01', recurrence: { frequency: 'monthly', endsOn: '2026-01-01' } }));
	const completed = (await service.listSeries({ search: 'Extend' })).series[0];
	const extended = await service.updateSeries(completed.id, { ...completed, endsOn: '2026-12-01' });
	assert.equal(extended.nextDueOn, '2026-11-01'); assert.equal((await service.list({ search: 'Extend' })).total, 1);
});

test('filtered lists and summaries keep exact cents, distinguish pending money and paginate deterministically', async (t) => {
	const { service, clients } = await fixture(t); const client = await clients.create({ name: 'Cliente filtro' });
	await service.create(input({ amountCents: 10, status: 'settled', paidOn: '2026-10-20', clientId: client.id, concept: 'Oferta 50%_especial' }));
	await service.create(input({ amountCents: 20, status: 'settled', paidOn: '2026-10-20' }));
	await service.create(input({ kind: 'expense', amountCents: 11, status: 'settled', paidOn: '2026-10-20' }));
	await service.create(input({ kind: 'expense', amountCents: 200 }));
	await service.create(input({ amountCents: 300, dueOn: '2026-11-01' }));
	let result = await service.list({ kind: 'income', from: '2026-10-01', to: '2026-10-31', pageSize: 1 });
	assert.equal(result.total, 2); assert.deepEqual(result.summary, { received: 30, paid: 11, balance: 19, pendingIncome: 0, pendingExpense: 200 });
	assert.notEqual(result.entries[0].id, (await service.list({ kind: 'income', from: '2026-10-01', to: '2026-10-31', pageSize: 1, page: 2 })).entries[0].id);
	assert.equal((await service.list({ search: '%_' })).total, 1); assert.equal((await service.list({ clientId: client.id })).total, 1);
	assert.equal((await service.list({ status: 'pending' })).total, 2); assert.equal((await service.list({ recurrence: 'recurring' })).total, 0);
	for (const options of [{ from: '2026-12-01', to: '2026-01-01' }, { pageSize: 51 }, { kind: 'bad' }, { recurrence: 'bad' }]) await assert.rejects(service.list(options), { status: 400 });
});

test('categories have unique names per kind, version checks and protected relationships', async (t) => {
	const { service } = await fixture(t); let category = await service.saveCategory({ name: 'Nueva', kind: 'expense' });
	await assert.rejects(service.saveCategory({ name: 'nueva', kind: 'expense' }), { status: 409 });
	assert.ok(await service.saveCategory({ name: 'Nueva', kind: 'income' }));
	category = await service.saveCategory({ ...category, name: 'Renombrada' }, category.id);
	const entry = await service.create(input({ kind: 'expense', categoryId: category.id }));
	await assert.rejects(service.deleteCategory(category.id, category.version), { status: 409 });
	await service.remove(entry.id, entry.version); await service.deleteCategory(category.id, category.version);
	assert.equal((await service.categories()).some((item) => item.id === category.id), false);
});

test('private attachments validate signatures, replace/remove safely and compensate failed SQL or stale updates', async (t) => {
	const { service, bucket, db } = await fixture(t);
	await db.execute("CREATE TRIGGER fail_insert BEFORE INSERT ON finance_entries BEGIN SELECT RAISE(ABORT,'Insert failure'); END");
	await assert.rejects(service.create(input({ recurrence: { frequency: 'monthly' } }), pdf()), /Insert failure/);
	assert.equal(bucket.objects.size, 0); assert.equal((await service.listSeries({})).total, 0); await db.execute('DROP TRIGGER fail_insert');
	await assert.rejects(service.create(input(), new File(['<html>'], 'receipt.pdf', { type: 'application/pdf' })), { status: 415 });
	await assert.rejects(service.create(input(), new File([], 'empty.pdf')), { status: 413 });
	let saved = await service.create(input(), pdf()); const [key] = bucket.objects.keys(); assert.match(key, /^finance\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.pdf$/);
	const response = await service.readAttachment(saved.id); assert.equal(response.headers.get('Content-Type'), 'application/pdf'); assert.equal(response.headers.get('Cache-Control'), 'private, no-store'); assert.match(response.headers.get('Content-Disposition'), /^attachment;/); assert.equal(await response.text(), '%PDF-1.7\nTest receipt');
	saved = await service.update(saved.id, { ...saved, concept: 'Cambio sin archivo' }); assert.equal(bucket.objects.has(key), true);
	bucket.failPut = true; await assert.rejects(service.update(saved.id, { ...saved }, pdf()), /R2 unavailable/); bucket.failPut = false; assert.equal(bucket.objects.size, 1);
	await db.execute("CREATE TRIGGER fail_finance BEFORE UPDATE ON finance_entries BEGIN SELECT RAISE(ABORT,'SQL failed'); END");
	await assert.rejects(service.update(saved.id, { ...saved }, pdf()), /SQL failed/); assert.equal(bucket.objects.size, 1); assert.equal(bucket.objects.has(key), true); await db.execute('DROP TRIGGER fail_finance');
	bucket.afterPut = async () => { await service.update(saved.id, { ...saved, concept: 'Concurrent update' }); };
	await assert.rejects(service.update(saved.id, { ...saved }, pdf()), { status: 409 }); assert.equal(bucket.objects.size, 1); bucket.afterPut = undefined;
	saved = await service.get(saved.id); saved = await service.update(saved.id, { ...saved }, pdf()); assert.equal(bucket.objects.size, 1); assert.equal(bucket.objects.has(key), false);
	saved = await service.update(saved.id, { ...saved, removeAttachment: true }); assert.equal(saved.attachment, null); assert.equal(bucket.objects.size, 0);
	saved = await service.update(saved.id, { ...saved }, pdf()); await service.remove(saved.id, saved.version); assert.equal(bucket.objects.size, 0); await assert.rejects(service.readAttachment(saved.id), { status: 404 });
});

test('HTTP routes cover protected CRUD, multipart limits, categories, recurring management and private downloads', async (t) => {
	const { db, bucket } = await fixture(t); const database = () => new Proxy(db, { get(target, key) { return key === 'close' ? () => {} : typeof target[key] === 'function' ? target[key].bind(target) : target[key]; } });
	const app = new Hono().use(async (c, next) => { if (c.req.header('Authorization') !== 'Bearer test') return c.json({ error: 'Unauthorized' }, 401); await next(); }).use(requestBodyLimit).route('/v1/finance', createFinanceRoutes(database));
	app.onError((error, c) => c.json({ error: error.message }, error.status ?? 500));
	const call = (path, init = {}) => app.request(`https://api.test/v1/finance${path}`, { ...init, headers: { Authorization: 'Bearer test', ...init.headers } }, { GALLERY_BUCKET: bucket });
	const json = (data, method = 'POST') => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
	assert.equal((await app.request('https://api.test/v1/finance/entries')).status, 401);
	const form = new FormData(); form.set('data', JSON.stringify(input({ dueOn: today(), recurrence: { frequency: 'monthly' } }))); form.set('attachment', new File(['%PDF-1.7\n', new Uint8Array(2 * 1024 * 1024)], 'Receipt.pdf'));
	let response = await call('/entries', { method: 'POST', body: form }); assert.equal(response.status, 201); const saved = await response.json();
	response = await call(`/entries/${saved.id}/file`); assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'private, no-store'); await response.body.cancel();
	assert.equal((await (await call('/entries?kind=income')).json()).total, 1);
	const schedule = (await (await call('/series')).json()).series[0]; assert.equal((await call(`/series/${schedule.id}`, json({ ...schedule, amountCents: 50000 }, 'PATCH'))).status, 200);
	assert.equal((await call(`/series/${schedule.id}/cancel?version=${schedule.version + 1}`, { method: 'POST' })).status, 200);
	assert.equal((await call(`/entries/${saved.id}`, json({ ...saved, status: 'settled', paidOn: today() }, 'PATCH'))).status, 200);
	assert.equal((await call(`/entries/${saved.id}?version=1`, { method: 'DELETE' })).status, 200); assert.equal(bucket.objects.size, 0);
	const oversized = new FormData(); oversized.set('data', JSON.stringify(input())); oversized.set('attachment', new File(['%PDF-', new Uint8Array(11 * 1024 * 1024)], 'large.pdf'));
	assert.equal((await call('/entries', { method: 'POST', body: oversized })).status, 413);
	assert.equal((await call('/entries', { method: 'POST', body: '{bad' })).status, 400);
});
