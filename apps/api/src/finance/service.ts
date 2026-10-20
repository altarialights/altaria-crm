import type { Client, InStatement, InValue, Row, Transaction } from '@libsql/client/web';
import { imageFormat, MAX_IMAGE_BYTES, validId } from '../gallery/service';
import { bad, conflict, date, frequency, kind, nextDue, object, pagination, text, today, version } from './validation';

type Database = Client | Transaction;
type Bucket = Pick<R2Bucket, 'put' | 'get' | 'delete'>;
type Attachment = { key: string; name: string; type: string; size: number };
export type Filters = { kind?: string; search?: string; clientId?: string; categoryId?: string; from?: string; to?: string; status?: string; recurrence?: string; page?: number; pageSize?: number };
const entrySelect = 'SELECT e.*, c.name AS client_name, k.name AS category_name, s.frequency, s.active AS series_active FROM finance_entries e LEFT JOIN clients c ON c.id=e.client_id LEFT JOIN finance_categories k ON k.id=e.category_id LEFT JOIN finance_series s ON s.id=e.series_id';
const seriesSelect = 'SELECT s.*, c.name AS client_name, k.name AS category_name FROM finance_series s LEFT JOIN clients c ON c.id=s.client_id LEFT JOIN finance_categories k ON k.id=s.category_id';
const timestamp = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
function str(value: unknown): string { if (typeof value !== 'string') throw new Error('Unexpected finance database column'); return value; }
function optional(value: unknown) { return value === null || value === undefined ? null : str(value); }
function entry(row: Row) {
	return { id: str(row.id), kind: kind(row.kind), concept: str(row.concept), amountCents: Number(row.amount_cents), categoryId: optional(row.category_id), categoryName: optional(row.category_name), clientId: optional(row.client_id), clientName: optional(row.client_name), notes: str(row.notes), dueOn: str(row.due_on), status: str(row.status) as 'pending' | 'settled', paidOn: optional(row.paid_on), seriesId: optional(row.series_id), frequency: optional(row.frequency), seriesActive: row.series_active === 1, attachment: row.attachment_key ? { name: str(row.attachment_name), type: str(row.attachment_type), size: Number(row.attachment_size), url: `/finanzas/archivo/${str(row.id)}?v=${encodeURIComponent(str(row.attachment_key).split('/').pop()!)}` } : null, version: Number(row.version), createdAt: str(row.created_at) };
}
function series(row: Row) {
	const available = row.active === 1 && (!row.ends_on || str(row.next_due_on) <= str(row.ends_on)) && str(row.next_due_on) <= '2099-12-31';
	return { id: str(row.id), kind: kind(row.kind), concept: str(row.concept), amountCents: Number(row.amount_cents), categoryId: optional(row.category_id), categoryName: optional(row.category_name), clientId: optional(row.client_id), clientName: optional(row.client_name), notes: str(row.notes), frequency: frequency(row.frequency), startsOn: str(row.starts_on), endsOn: optional(row.ends_on), nextDueOn: available ? str(row.next_due_on) : null, state: row.active === 0 ? 'cancelled' : available ? 'active' : 'completed', version: Number(row.version) };
}
function attachment(row: Row): Attachment | null { return row.attachment_key ? { key: str(row.attachment_key), name: str(row.attachment_name), type: str(row.attachment_type), size: Number(row.attachment_size) } : null; }
function fields(input: unknown) {
	const data = object(input); const amount = data.amountCents;
	if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 1 || amount > 9999999999) bad('Introduce un importe positivo de hasta 99.999.999,99 € con un máximo de dos decimales.');
	return { data, kind: kind(data.kind), concept: text(data.concept, 'Concepto', 200, true), amountCents: amount, categoryId: data.categoryId == null || data.categoryId === '' ? null : validId(text(data.categoryId, 'Categoría', 36, true)), clientId: data.clientId == null || data.clientId === '' ? null : validId(text(data.clientId, 'Cliente', 36, true)), notes: text(data.notes, 'Notas', 5000, false, true) };
}
function settlement(data: Record<string, unknown>, currentDay: string) {
	const status = data.status ?? 'pending';
	if (status !== 'pending' && status !== 'settled') bad('Estado no válido.');
	const paidOn = status === 'settled' ? date(data.paidOn, 'Fecha de cobro o pago') : null;
	if (paidOn && paidOn > currentDay) bad('La fecha de cobro o pago no puede ser futura.');
	return { status, paidOn };
}
function filter(options: Filters, alias: 'e' | 's', includeKind = true) {
	const conditions = alias === 'e' ? ['e.deleted_at IS NULL'] : ['1=1']; const args: InValue[] = [];
	if (includeKind && options.kind) { conditions.push(`${alias}.kind=?`); args.push(kind(options.kind)); }
	const search = text(options.search ?? '', 'Búsqueda', 200);
	if (search) { conditions.push(`(${alias}.concept LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR c.company LIKE ? ESCAPE '\\' OR k.name LIKE ? ESCAPE '\\')`); const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`; args.push(pattern, pattern, pattern, pattern); }
	for (const [value, column] of [[options.clientId, 'client_id'], [options.categoryId, 'category_id']]) if (value) { conditions.push(`${alias}.${column}=?`); args.push(validId(value)); }
	if (alias === 'e') {
		if (options.from) { conditions.push('e.due_on>=?'); args.push(date(options.from)); }
		if (options.to) { conditions.push('e.due_on<=?'); args.push(date(options.to)); }
		if (options.from && options.to && options.from > options.to) bad('La fecha inicial debe ser anterior a la final.');
		if (options.status) { if (!['pending', 'settled'].includes(options.status)) bad('Estado no válido.'); conditions.push('e.status=?'); args.push(options.status); }
		if (options.recurrence) { if (!['once', 'recurring'].includes(options.recurrence)) bad('Filtro de recurrencia no válido.'); conditions.push(`e.series_id IS ${options.recurrence === 'once' ? '' : 'NOT '}NULL`); }
	}
	return { where: ` WHERE ${conditions.join(' AND ')}`, args };
}

export class FinanceService {
	constructor(private readonly db: Client, private readonly bucket?: Bucket, private readonly clock: () => string = today) {}
	private storage() { if (!this.bucket) bad('No se pudo conectar con el almacenamiento de justificantes.', 503); return this.bucket; }
	private async clean(key?: string) { if (key) try { await this.storage().delete(key); } catch { console.error(JSON.stringify({ message: 'finance attachment cleanup failed', key })); } }
	private async upload(id: string, file: File): Promise<Attachment> {
		if (!file.size || file.size > MAX_IMAGE_BYTES) bad('El justificante debe ocupar entre 1 byte y 10 MB.', 413);
		const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
		const format = String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-' ? { type: 'application/pdf', extension: 'pdf' } : imageFormat(bytes);
		if (!format) bad('Selecciona un PDF o una imagen PNG, JPEG, WebP, GIF o AVIF.', 415);
		const name = text(file.name.split(/[\\/]/).pop(), 'Nombre del archivo', 200, true);
		const result = { key: `finance/${id}/${crypto.randomUUID()}.${format.extension}`, name, type: format.type, size: file.size };
		await this.storage().put(result.key, file, { httpMetadata: { contentType: result.type } }); return result;
	}
	private async references(db: Database, data: ReturnType<typeof fields>) {
		if (data.clientId && !(await db.execute({ sql: 'SELECT id FROM clients WHERE id=?', args: [data.clientId] })).rows.length) bad('El cliente seleccionado ya no existe.');
		if (data.categoryId && !(await db.execute({ sql: 'SELECT id FROM finance_categories WHERE id=? AND kind=?', args: [data.categoryId, data.kind] })).rows.length) bad('La categoría no corresponde al tipo de movimiento.');
	}
	async categories(type?: string) {
		const result = await this.db.execute({ sql: `SELECT * FROM finance_categories${type ? ' WHERE kind=?' : ''} ORDER BY name COLLATE NOCASE, id`, args: type ? [kind(type)] : [] });
		return result.rows.map((row) => ({ id: str(row.id), kind: kind(row.kind), name: str(row.name), version: Number(row.version) }));
	}
	async saveCategory(input: unknown, id?: string) {
		const data = object(input); const name = text(data.name, 'Categoría', 100, true); const type = kind(data.kind);
		try {
			if (id) {
				const result = await this.db.execute({ sql: 'UPDATE finance_categories SET name=?, version=version+1 WHERE id=? AND kind=? AND version=? RETURNING *', args: [name, validId(id), type, version(data.version)] });
				if (!result.rows.length) conflict();
			} else { id = crypto.randomUUID(); await this.db.execute({ sql: 'INSERT INTO finance_categories(id,kind,name) VALUES(?,?,?)', args: [id, type, name] }); }
		} catch (cause) { if (cause instanceof Error && 'code' in cause && String(cause.code).startsWith('SQLITE_CONSTRAINT')) bad('Ya existe una categoría con ese nombre.', 409); throw cause; }
		return (await this.categories(type)).find((item) => item.id === id)!;
	}
	async deleteCategory(id: string, expected: number) {
		try { const result = await this.db.execute({ sql: 'DELETE FROM finance_categories WHERE id=? AND version=?', args: [validId(id), version(expected)] }); if (!result.rowsAffected) conflict(); }
		catch (cause) { if (cause instanceof Error && 'code' in cause && String(cause.code).startsWith('SQLITE_CONSTRAINT')) bad('Esta categoría tiene movimientos o recurrencias asociados. Cambia su categoría antes de eliminarla.', 409); throw cause; }
	}
	private async row(id: string, db: Database = this.db) {
		const result = await db.execute({ sql: `${entrySelect} WHERE e.id=? AND e.deleted_at IS NULL`, args: [validId(id)] });
		if (!result.rows.length) bad('El movimiento ya no existe.', 404); return result.rows[0];
	}
	async get(id: string) { return entry(await this.row(id)); }
	async list(options: Filters) {
		const { page, pageSize } = pagination(options.page, options.pageSize); const filtered = filter(options, 'e'); const summary = filter(options, 'e', false);
		const joins = ' FROM finance_entries e LEFT JOIN clients c ON c.id=e.client_id LEFT JOIN finance_categories k ON k.id=e.category_id';
		const results = await this.db.batch([
			{ sql: `SELECT count(*) AS total${joins}${filtered.where}`, args: filtered.args },
			{ sql: `${entrySelect}${filtered.where} ORDER BY e.due_on DESC, e.created_at DESC, e.id LIMIT ? OFFSET ?`, args: [...filtered.args, pageSize, (page - 1) * pageSize] },
			{ sql: `SELECT coalesce(sum(CASE WHEN e.kind='income' AND e.status='settled' THEN e.amount_cents ELSE 0 END),0) AS received, coalesce(sum(CASE WHEN e.kind='expense' AND e.status='settled' THEN e.amount_cents ELSE 0 END),0) AS paid, coalesce(sum(CASE WHEN e.kind='income' AND e.status='pending' THEN e.amount_cents ELSE 0 END),0) AS pending_income, coalesce(sum(CASE WHEN e.kind='expense' AND e.status='pending' THEN e.amount_cents ELSE 0 END),0) AS pending_expense${joins}${summary.where}`, args: summary.args },
		], 'read');
		const sums = results[2].rows[0];
		return { entries: results[1].rows.map(entry), total: Number(results[0].rows[0].total), page, pageSize, summary: { received: Number(sums.received), paid: Number(sums.paid), balance: Number(sums.received) - Number(sums.paid), pendingIncome: Number(sums.pending_income), pendingExpense: Number(sums.pending_expense) } };
	}
	async create(input: unknown, file?: File) {
		const data = fields(input); const due = date(data.data.dueOn, 'Fecha prevista'); const payment = settlement(data.data, this.clock()); const id = crypto.randomUUID();
		if (data.data.removeAttachment !== undefined && typeof data.data.removeAttachment !== 'boolean') bad('La opción de quitar el justificante no es válida.');
		if (file && data.data.removeAttachment) bad('Elige subir o quitar el justificante.');
		const recurring = data.data.recurrence == null ? null : object(data.data.recurrence);
		const interval = recurring ? frequency(recurring.frequency) : null; const end = recurring?.endsOn ? date(recurring.endsOn, 'Fecha de fin') : null;
		if (end && end < due) bad('La fecha de fin no puede ser anterior al primer vencimiento.');
		const seriesId = interval ? crypto.randomUUID() : null; const uploaded = file ? await this.upload(id, file) : null;
		try {
			const transaction = await this.db.transaction('write');
			try {
				await this.references(transaction, data);
				if (seriesId && interval) await transaction.execute({ sql: 'INSERT INTO finance_series(id,kind,concept,amount_cents,category_id,client_id,notes,frequency,starts_on,ends_on,anchor_day,last_due_on,next_due_on) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', args: [seriesId, data.kind, data.concept, data.amountCents, data.categoryId, data.clientId, data.notes, interval, due, end, Number(due.slice(8)), due, nextDue(due, interval, Number(due.slice(8)))] });
				await transaction.execute({ sql: 'INSERT INTO finance_entries(id,kind,concept,amount_cents,category_id,client_id,notes,due_on,status,paid_on,series_id,occurrence_index,attachment_key,attachment_name,attachment_type,attachment_size) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', args: [id, data.kind, data.concept, data.amountCents, data.categoryId, data.clientId, data.notes, due, payment.status, payment.paidOn, seriesId, seriesId ? 0 : null, uploaded?.key ?? null, uploaded?.name ?? null, uploaded?.type ?? null, uploaded?.size ?? null] });
				const result = entry(await this.row(id, transaction)); await transaction.commit(); return result;
			} finally { transaction.close(); }
		} catch (cause) { await this.clean(uploaded?.key); throw cause; }
	}
	async update(id: string, input: unknown, file?: File) {
		const data = fields(input); const expected = version(data.data.version); const due = date(data.data.dueOn); const payment = settlement(data.data, this.clock());
		if (data.data.removeAttachment !== undefined && typeof data.data.removeAttachment !== 'boolean') bad('La opción de quitar el justificante no es válida.');
		if (file && data.data.removeAttachment) bad('Elige subir o quitar el justificante.');
		if (data.data.recurrence != null) bad('Modifica la recurrencia desde Recurrentes.');
		if (Number((await this.row(id)).version) !== expected) conflict();
		const uploaded = file ? await this.upload(id, file) : null; let old: Attachment | null = null; let result: ReturnType<typeof entry>;
		try {
			const transaction = await this.db.transaction('write');
			try {
				const existing = await this.row(id, transaction); if (Number(existing.version) !== expected) conflict();
				if (existing.kind !== data.kind) bad('No se puede cambiar el tipo de un movimiento existente.');
				await this.references(transaction, data);
				await transaction.execute({ sql: `UPDATE finance_entries SET concept=?,amount_cents=?,category_id=?,client_id=?,notes=?,due_on=?,status=?,paid_on=?,version=version+1,updated_at=${timestamp} WHERE id=? AND version=?`, args: [data.concept, data.amountCents, data.categoryId, data.clientId, data.notes, due, payment.status, payment.paidOn, id, expected] });
				if (file || data.data.removeAttachment) { old = attachment(existing); await transaction.execute({ sql: 'UPDATE finance_entries SET attachment_key=?,attachment_name=?,attachment_type=?,attachment_size=? WHERE id=?', args: [uploaded?.key ?? null, uploaded?.name ?? null, uploaded?.type ?? null, uploaded?.size ?? null, id] }); }
				result = entry(await this.row(id, transaction)); await transaction.commit();
			} finally { transaction.close(); }
		} catch (cause) { await this.clean(uploaded?.key); throw cause; }
		await this.clean(old?.key); return result;
	}
	async remove(id: string, expected: number) {
		version(expected); let old: Attachment | null;
		const transaction = await this.db.transaction('write');
		try {
			const existing = await this.row(id, transaction); if (Number(existing.version) !== expected) conflict(); old = attachment(existing);
			// Keep the occurrence identity so a deleted installment is never regenerated.
			await transaction.execute({ sql: `UPDATE finance_entries SET deleted_at=${timestamp},category_id=NULL,client_id=NULL,attachment_key=NULL,attachment_name=NULL,attachment_type=NULL,attachment_size=NULL,version=version+1,updated_at=${timestamp} WHERE id=? AND version=?`, args: [id, expected] });
			await transaction.commit();
		} finally { transaction.close(); }
		await this.clean(old?.key);
	}
	async readAttachment(id: string) {
		const saved = attachment(await this.row(id)); if (!saved) bad('Este movimiento no tiene justificante.', 404);
		const file = await this.storage().get(saved.key); if (!file) bad('No se encontró el justificante.', 404);
		return new Response(file.body, { headers: { 'Content-Type': saved.type, 'Content-Length': String(file.size), 'Content-Disposition': `attachment; filename="justificante.${saved.key.split('.').pop()}"; filename*=UTF-8''${encodeURIComponent(saved.name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
	}
	async listSeries(options: Filters) {
		const { page, pageSize } = pagination(options.page, options.pageSize); const filtered = filter(options, 's');
		const result = await this.db.batch([
			{ sql: `SELECT count(*) AS total FROM finance_series s LEFT JOIN clients c ON c.id=s.client_id LEFT JOIN finance_categories k ON k.id=s.category_id${filtered.where}`, args: filtered.args },
			{ sql: `${seriesSelect}${filtered.where} ORDER BY s.active DESC,s.next_due_on,s.id LIMIT ? OFFSET ?`, args: [...filtered.args, pageSize, (page - 1) * pageSize] },
		], 'read');
		return { series: result[1].rows.map(series), total: Number(result[0].rows[0].total), page, pageSize };
	}
	async updateSeries(id: string, input: unknown) {
		const data = fields(input); const expected = version(data.data.version); const interval = frequency(data.data.frequency); const end = data.data.endsOn ? date(data.data.endsOn, 'Fecha de fin') : null;
		await this.syncDue();
		const transaction = await this.db.transaction('write');
		try {
			const existing = (await transaction.execute({ sql: `${seriesSelect} WHERE s.id=?`, args: [validId(id)] })).rows[0];
			if (!existing) bad('La recurrencia ya no existe.', 404); if (Number(existing.version) !== expected) conflict();
			if (existing.active !== 1) bad('Esta recurrencia está cancelada. Crea otra para volver a programarla.', 409);
			if (data.kind !== existing.kind) bad('No se puede cambiar el tipo de una recurrencia.');
			if (end && end < str(existing.last_due_on)) bad('La fecha de fin no puede ser anterior al último vencimiento creado.');
			await this.references(transaction, data);
			let next = nextDue(str(existing.last_due_on), interval, Number(existing.anchor_day));
			// Changing frequency or extending an ended schedule must not create new
			// charges for periods that were never scheduled under the old settings.
			while (next <= this.clock()) next = nextDue(next, interval, Number(existing.anchor_day));
			await transaction.execute({ sql: `UPDATE finance_series SET concept=?,amount_cents=?,category_id=?,client_id=?,notes=?,frequency=?,ends_on=?,next_due_on=?,version=version+1,updated_at=${timestamp} WHERE id=? AND version=?`, args: [data.concept, data.amountCents, data.categoryId, data.clientId, data.notes, interval, end, next, id, expected] });
			const result = series((await transaction.execute({ sql: `${seriesSelect} WHERE s.id=?`, args: [id] })).rows[0]); await transaction.commit(); return result;
		} finally { transaction.close(); }
	}
	async cancelSeries(id: string, expected: number) {
		await this.syncDue();
		const result = await this.db.execute({ sql: `UPDATE finance_series SET active=0,version=version+1,updated_at=${timestamp} WHERE id=? AND version=? AND active=1`, args: [validId(id), version(expected)] });
		if (!result.rowsAffected) conflict();
	}
	/** Daily cron and authenticated list requests share this bounded, idempotent catch-up. */
	async syncDue(day = this.clock()) {
		date(day); let generated = 0;
		for (let batch = 0; batch < 10; batch++) {
			const due = await this.db.execute({ sql: 'SELECT * FROM finance_series WHERE active=1 AND next_due_on<=? AND (ends_on IS NULL OR next_due_on<=ends_on) ORDER BY next_due_on,id LIMIT 50', args: [day] });
			if (!due.rows.length) return generated;
			const statements: InStatement[] = []; let count = 0;
			for (const row of due.rows) {
				let occurrence = str(row.next_due_on); let index = Number(row.next_index); let revision = Number(row.version);
				while (occurrence <= day && (!row.ends_on || occurrence <= str(row.ends_on)) && count < 100) {
					const next = nextDue(occurrence, frequency(row.frequency), Number(row.anchor_day));
					statements.push({ sql: "INSERT INTO finance_entries(id,kind,concept,amount_cents,category_id,client_id,notes,due_on,series_id,occurrence_index) SELECT ?,kind,concept,amount_cents,category_id,client_id,notes,next_due_on,id,next_index FROM finance_series WHERE id=? AND active=1 AND next_index=? AND version=? ON CONFLICT(series_id,occurrence_index) DO NOTHING", args: [crypto.randomUUID(), str(row.id), index, revision] });
					statements.push({ sql: `UPDATE finance_series SET last_due_on=next_due_on,next_due_on=?,next_index=next_index+1,version=version+1,updated_at=${timestamp} WHERE id=? AND active=1 AND next_index=? AND version=?`, args: [next, str(row.id), index, revision] });
					occurrence = next; index++; revision++; count++;
				}
				if (count >= 100) break;
			}
			const results = await this.db.batch(statements, 'write'); generated += results.filter((_, index) => index % 2 === 0).reduce((sum, result) => sum + result.rowsAffected, 0);
		}
		const remaining = await this.db.execute({ sql: 'SELECT id FROM finance_series WHERE active=1 AND next_due_on<=? AND (ends_on IS NULL OR next_due_on<=ends_on) LIMIT 1', args: [day] });
		if (!remaining.rows.length) return generated;
		bad('Se están actualizando los vencimientos pendientes. Vuelve a actualizar la lista.', 503);
	}
}
