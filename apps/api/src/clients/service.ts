import type { Client, InValue, Row, Transaction } from '@libsql/client/web';
import { HTTPException } from 'hono/http-exception';
import { imageFormat, MAX_IMAGE_BYTES, validId } from '../gallery/service';

type Bucket = Pick<R2Bucket, 'put' | 'get' | 'delete'>;
type Logo = { key: string; type: string; size: number };

export const CLIENT_STAGES = ['uncontacted', 'first_contact', 'meeting_scheduled', 'quote_sent', 'quote_accepted', 'project_started', 'project_finished'] as const;
export type ClientStage = typeof CLIENT_STAGES[number];
function isStage(value: unknown): value is ClientStage { return CLIENT_STAGES.some((stage) => stage === value); }
function text(value: unknown): string {
	if (typeof value !== 'string') throw new Error('Unexpected client database column type');
	return value;
}
function record(row: Row) {
	return { id: text(row.id), name: text(row.name), company: text(row.company), logoUrl: row.logo_key ? `/clientes/logo/${text(row.id)}?v=${encodeURIComponent(text(row.logo_key).split('/').pop()!)}` : null, email: text(row.email), phone: text(row.phone), website: text(row.website), notes: text(row.notes), stage: text(row.stage) as ClientStage, position: Number(row.position), version: Number(row.version), createdAt: text(row.created_at), updatedAt: text(row.updated_at) };
}
function inputText(value: unknown, label: string, max: number, required = false, multiline = false) {
	if (value === undefined && !required) return '';
	if (typeof value !== 'string' || value.length > max || [...value].some((char) => (char.charCodeAt(0) < 32 && !(multiline && ['\n', '\r', '\t'].includes(char))) || char.charCodeAt(0) === 127) || (required && !value.trim())) throw new HTTPException(400, { message: `${label}: introduce un valor válido de hasta ${max} caracteres.` });
	return value.trim().normalize('NFC');
}
function dataObject(input: unknown): Record<string, unknown> {
	if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HTTPException(400, { message: 'Datos de cliente no válidos.' });
	return input as Record<string, unknown>;
}
function version(value: unknown): number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new HTTPException(400, { message: 'Versión de cliente no válida. Actualiza la vista.' });
	return value;
}
function conflict(): never { throw new HTTPException(409, { message: 'Este cliente ha cambiado. Actualiza la vista antes de guardar.' }); }
function values(input: unknown) {
	const data = dataObject(input);
	if (data.removeLogo !== undefined && typeof data.removeLogo !== 'boolean') throw new HTTPException(400, { message: 'La opción de quitar el logo no es válida.' });
	const name = inputText(data.name, 'Nombre', 200, true);
	const company = inputText(data.company, 'Empresa', 200);
	const email = inputText(data.email, 'Email', 254);
	const phone = inputText(data.phone, 'Teléfono', 50);
	let website = inputText(data.website, 'Web', 2048);
	const notes = inputText(data.notes, 'Notas', 5000, false, true);
	if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) throw new HTTPException(400, { message: 'Introduce un email válido.' });
	if (website) {
		let parsed: URL;
		try { parsed = new URL(website); } catch { throw new HTTPException(400, { message: 'Introduce una web completa, por ejemplo https://ejemplo.com.' }); }
		if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.href.length > 2048) throw new HTTPException(400, { message: 'La web debe ser una URL HTTP o HTTPS sin credenciales.' });
		website = parsed.href;
	}
	const stage = data.stage ?? 'uncontacted';
	if (!isStage(stage)) throw new HTTPException(400, { message: 'Fase de cliente no válida.' });
	return { data, name, company, email, phone, website, notes, stage };
}
export class ClientService {
	constructor(private readonly db: Client, private readonly bucket?: Bucket) {}
	private storage() {
		if (!this.bucket) throw new HTTPException(503, { message: 'No se pudo conectar con el almacenamiento de logos.' });
		return this.bucket;
	}
	private async uploadLogo(id: string, file: File): Promise<Logo> {
		if (!file.size || file.size > MAX_IMAGE_BYTES) throw new HTTPException(413, { message: 'El logo debe ocupar entre 1 byte y 10 MB.' });
		const format = imageFormat(new Uint8Array(await file.slice(0, 64).arrayBuffer()));
		if (!format) throw new HTTPException(415, { message: 'Selecciona un logo en PNG, JPEG, WebP, GIF o AVIF.' });
		const logo = { key: `client-logos/${id}/${crypto.randomUUID()}.${format.extension}`, type: format.type, size: file.size };
		await this.storage().put(logo.key, file, { httpMetadata: { contentType: logo.type } });
		return logo;
	}
	private async cleanLogo(key: string | undefined) {
		if (!key) return;
		// SQL and R2 cannot share a transaction. Only delete objects that no longer
		// belong to a committed record; cleanup errors must not undo a saved client.
		try { await this.storage().delete(key); }
		catch { console.error(JSON.stringify({ message: 'client logo cleanup failed', key })); }
	}
	private async storedLogo(id: string, db: Client | Transaction = this.db): Promise<Logo | null> {
		const result = await db.execute({ sql: 'SELECT logo_key, logo_content_type, logo_size_bytes FROM clients WHERE id = ?', args: [validId(id)] });
		if (!result.rows.length) throw new HTTPException(404, { message: 'El cliente ya no existe.' });
		const row = result.rows[0];
		return row.logo_key ? { key: text(row.logo_key), type: text(row.logo_content_type), size: Number(row.logo_size_bytes) } : null;
	}
	async readLogo(id: string) {
		const logo = await this.storedLogo(id);
		if (!logo) throw new HTTPException(404, { message: 'Este cliente no tiene logo.' });
		const object = await this.storage().get(logo.key);
		if (!object) throw new HTTPException(404, { message: 'No se encontró el logo.' });
		return new Response(object.body, { headers: { 'Content-Type': logo.type, 'Content-Length': String(object.size), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
	}
	async list(options: { search?: string; stage?: string; page?: number; pageSize?: number; order?: string }) {
		const page = options.page ?? 1; const pageSize = options.pageSize ?? 20;
		if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) throw new HTTPException(400, { message: 'Paginación no válida.' });
		if (options.order && !['name', 'position'].includes(options.order)) throw new HTTPException(400, { message: 'Orden no válido.' });
		const conditions: string[] = []; const args: InValue[] = [];
		if (options.stage) {
			if (!isStage(options.stage)) throw new HTTPException(400, { message: 'Fase de cliente no válida.' });
			conditions.push('stage = ?'); args.push(options.stage);
		}
		const search = inputText(options.search ?? '', 'Búsqueda', 200);
		if (search) {
			conditions.push("(name LIKE ? ESCAPE '\\' OR company LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')");
			const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`; args.push(pattern, pattern, pattern, pattern);
		}
		const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
		const order = options.order === 'position' ? 'position, id' : 'name COLLATE NOCASE, id';
		const result = await this.db.batch([
			{ sql: `SELECT count(*) AS total FROM clients${where}`, args },
			{ sql: `SELECT * FROM clients${where} ORDER BY ${order} LIMIT ? OFFSET ?`, args: [...args, pageSize, (page - 1) * pageSize] },
		], 'read');
		return { clients: result[1].rows.map(record), total: Number(result[0].rows[0].total), page, pageSize };
	}
	async board(search = '') {
		const term = inputText(search, 'Búsqueda', 200);
		const where = term ? " WHERE name LIKE ? ESCAPE '\\' OR company LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\'" : '';
		const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
		const args = term ? [pattern, pattern, pattern, pattern] : [];
		// Counts and bounded columns share one read snapshot, including during moves.
		const result = await this.db.batch([
			{ sql: `SELECT stage, count(*) AS total FROM clients${where} GROUP BY stage`, args },
			{ sql: `SELECT * FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY stage ORDER BY position, id) AS row_number FROM clients${where}) WHERE row_number <= 20 ORDER BY position, id`, args },
		], 'read');
		const clients = result[1].rows.map(record);
		return { columns: CLIENT_STAGES.map((stage) => ({ stage, clients: clients.filter((client) => client.stage === stage), total: Number(result[0].rows.find((row) => row.stage === stage)?.total ?? 0), page: 1, pageSize: 20 })) };
	}
	async get(id: string, db: Client | Transaction = this.db) {
		validId(id);
		const result = await db.execute({ sql: 'SELECT * FROM clients WHERE id = ?', args: [id] });
		if (!result.rows.length) throw new HTTPException(404, { message: 'El cliente ya no existe.' });
		return record(result.rows[0]);
	}
	private async position(db: Transaction, stage: ClientStage, id: string, beforeId: string | null): Promise<number> {
		if (beforeId) {
			if (beforeId === id) throw new HTTPException(400, { message: 'Elige otra posición para el cliente.' });
			const next = await db.execute({ sql: 'SELECT position FROM clients WHERE id = ? AND stage = ?', args: [validId(beforeId), stage] });
			if (!next.rows.length) throw new HTTPException(409, { message: 'La ficha de destino ha cambiado. Actualiza el tablero.' });
			const nextPosition = Number(next.rows[0].position);
			const previous = await db.execute({ sql: 'SELECT position FROM clients WHERE stage = ? AND id <> ? AND position < ? ORDER BY position DESC LIMIT 1', args: [stage, id, nextPosition] });
			const previousPosition = previous.rows.length ? Number(previous.rows[0].position) : nextPosition - 2048;
			if (nextPosition - previousPosition < 0.000001) {
				await db.execute({ sql: 'WITH ranked AS MATERIALIZED (SELECT id, ROW_NUMBER() OVER (ORDER BY position, id) * 1024 AS rank FROM clients WHERE stage = ?) UPDATE clients SET position = (SELECT rank FROM ranked WHERE ranked.id = clients.id) WHERE stage = ?', args: [stage, stage] });
				return this.position(db, stage, id, beforeId);
			}
			return (previousPosition + nextPosition) / 2;
		}
		const last = await db.execute({ sql: 'SELECT max(position) AS last FROM clients WHERE stage = ? AND id <> ?', args: [stage, id] });
		return Number(last.rows[0].last ?? 0) + 1024;
	}
	async create(input: unknown, file?: File) {
		const data = values(input); const id = crypto.randomUUID();
		if (file && data.data.removeLogo) throw new HTTPException(400, { message: 'Elige subir o quitar el logo.' });
		const logo = file ? await this.uploadLogo(id, file) : null;
		try {
			const transaction = await this.db.transaction('write');
			try {
				const position = await this.position(transaction, data.stage, id, null);
				await transaction.execute({ sql: 'INSERT INTO clients (id,name,company,email,phone,website,notes,stage,position,logo_key,logo_content_type,logo_size_bytes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', args: [id, data.name, data.company, data.email, data.phone, data.website, data.notes, data.stage, position, logo?.key ?? null, logo?.type ?? null, logo?.size ?? null] });
				const result = await this.get(id, transaction); await transaction.commit(); return result;
			} finally { transaction.close(); }
		} catch (cause) { await this.cleanLogo(logo?.key); throw cause; }
	}
	async update(id: string, input: unknown, file?: File) {
		const data = values(input); const expected = version(data.data.version);
		if (file && data.data.removeLogo) throw new HTTPException(400, { message: 'Elige subir o quitar el logo.' });
		if ((await this.get(id)).version !== expected) conflict();
		const logo = file ? await this.uploadLogo(id, file) : null;
		let previous: Logo | null = null;
		let result: Awaited<ReturnType<ClientService['get']>>;
		try {
			const transaction = await this.db.transaction('write');
			try {
				const existing = await this.get(id, transaction);
				if (existing.version !== expected) conflict();
				if (file || data.data.removeLogo) previous = await this.storedLogo(id, transaction);
				const position = existing.stage === data.stage ? existing.position : await this.position(transaction, data.stage, id, null);
				await transaction.execute({ sql: "UPDATE clients SET name=?, company=?, email=?, phone=?, website=?, notes=?, stage=?, position=?, version=version+1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND version=?", args: [data.name, data.company, data.email, data.phone, data.website, data.notes, data.stage, position, id, expected] });
				if (file || data.data.removeLogo) await transaction.execute({ sql: 'UPDATE clients SET logo_key=?, logo_content_type=?, logo_size_bytes=? WHERE id=?', args: [logo?.key ?? null, logo?.type ?? null, logo?.size ?? null, id] });
				result = await this.get(id, transaction); await transaction.commit();
			} finally { transaction.close(); }
		} catch (cause) { await this.cleanLogo(logo?.key); throw cause; }
		await this.cleanLogo(previous?.key);
		return result;
	}
	async move(id: string, input: unknown) {
		const data = dataObject(input); const expected = version(data.version);
		if (!isStage(data.stage) || (data.beforeId !== undefined && data.beforeId !== null && typeof data.beforeId !== 'string')) throw new HTTPException(400, { message: 'Movimiento no válido.' });
		const transaction = await this.db.transaction('write');
		try {
			const existing = await this.get(id, transaction);
			if (existing.version !== expected) conflict();
			const position = await this.position(transaction, data.stage, id, typeof data.beforeId === 'string' ? data.beforeId : null);
			await transaction.execute({ sql: "UPDATE clients SET stage=?, position=?, version=version+1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND version=?", args: [data.stage, position, id, expected] });
			const result = await this.get(id, transaction); await transaction.commit(); return result;
		} finally { transaction.close(); }
	}
	async delete(id: string, expected: number) {
		validId(id); version(expected);
		let logo: Logo | null;
		const transaction = await this.db.transaction('write');
		try {
			const existing = await this.get(id, transaction);
			if (existing.version !== expected) conflict();
			const assigned = await transaction.execute({ sql: 'SELECT id FROM cards WHERE client_id = ? LIMIT 1', args: [id] });
			if (assigned.rows.length) throw new HTTPException(409, { message: 'Este cliente tiene tarjetas asignadas. Libéralas o asígnalas a otro cliente antes de eliminarlo.' });
			logo = await this.storedLogo(id, transaction);
			await transaction.execute({ sql: 'DELETE FROM clients WHERE id = ? AND version = ?', args: [id, expected] });
			await transaction.commit();
		} finally { transaction.close(); }
		await this.cleanLogo(logo?.key);
	}
}
