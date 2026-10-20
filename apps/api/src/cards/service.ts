import type { Client, InValue, Row } from '@libsql/client/web';
import { HTTPException } from 'hono/http-exception';
import { validId } from '../gallery/service';

export type CardStatus = 'free' | 'active' | 'paused';
const selectCard = `SELECT c.*, i.name AS design_name FROM cards c LEFT JOIN gallery_images i ON i.id = c.design_id`;
function text(value: unknown): string {
	if (typeof value !== 'string') throw new Error('Unexpected card database column type');
	return value;
}
function card(row: Row) {
	return { id: text(row.id), reference: text(row.reference), publicUrl: text(row.public_url), clientName: text(row.client_name), targetUrl: text(row.target_url), designId: row.design_id === null ? null : text(row.design_id), designName: row.design_name === null ? null : text(row.design_name), status: text(row.status) as CardStatus, createdAt: text(row.created_at), updatedAt: text(row.updated_at) };
}
function field(value: unknown, label: string, max: number, required = false) {
	if (typeof value !== 'string' || value.length > max || [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) || (required && !value.trim())) throw new HTTPException(400, { message: `${label}: introduce un valor válido de hasta ${max} caracteres.` });
	return value.trim().normalize('NFC');
}
function isStatus(value: unknown): value is CardStatus { return value === 'free' || value === 'active' || value === 'paused'; }

export class CardService {
	constructor(private readonly db: Client, private readonly publicOrigin: string) {}
	async list(options: { search?: string; status?: string; page?: number; pageSize?: number }) {
		const page = options.page ?? 1;
		const pageSize = options.pageSize ?? 10;
		if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) throw new HTTPException(400, { message: 'Paginación no válida.' });
		const conditions: string[] = []; const args: InValue[] = [];
		if (options.status) {
			if (!isStatus(options.status)) throw new HTTPException(400, { message: 'Estado no válido.' });
			conditions.push('c.status = ?'); args.push(options.status);
		}
		const search = field(options.search ?? '', 'Búsqueda', 200);
		if (search) {
			conditions.push("(c.reference LIKE ? ESCAPE '\\' OR c.client_name LIKE ? ESCAPE '\\' OR c.target_url LIKE ? ESCAPE '\\' OR c.id LIKE ? ESCAPE '\\')");
			const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`; args.push(pattern, pattern, pattern, pattern);
		}
		const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
		const result = await this.db.batch([
			{ sql: `SELECT count(*) AS total FROM cards c${where}`, args },
			{ sql: `${selectCard}${where} ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`, args: [...args, pageSize, (page - 1) * pageSize] },
		], 'read');
		return { cards: result[1].rows.map(card), total: Number(result[0].rows[0].total), page, pageSize };
	}
	async get(id: string) {
		validId(id);
		const result = await this.db.execute({ sql: `${selectCard} WHERE c.id = ?`, args: [id] });
		if (!result.rows.length) throw new HTTPException(404, { message: 'La tarjeta no existe.' });
		return card(result.rows[0]);
	}
	private async values(input: unknown, publicUrl: string) {
		if (!input || typeof input !== 'object') throw new HTTPException(400, { message: 'Datos de tarjeta no válidos.' });
		const data = input as Record<string, unknown>;
		const reference = field(data.reference, 'Nombre', 100, true);
		if (!isStatus(data.status)) throw new HTTPException(400, { message: 'Estado no válido.' });
		const clientName = data.status === 'free' ? '' : field(data.clientName, 'Cliente', 200, true);
		let targetUrl = data.status === 'free' ? '' : field(data.targetUrl, 'URL de destino', 2048, true);
		if (targetUrl) {
			let parsed: URL;
			try { parsed = new URL(targetUrl); } catch { throw new HTTPException(400, { message: 'Introduce una URL completa, por ejemplo https://ejemplo.com.' }); }
			if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.href.length > 2048) throw new HTTPException(400, { message: 'El destino debe ser una URL HTTP o HTTPS sin credenciales.' });
			targetUrl = parsed.href;
			const hosts = [new URL(publicUrl).host, new URL(this.publicOrigin).host];
			if (hosts.includes(parsed.host) && /^\/t(?:\/|$)/.test(parsed.pathname)) throw new HTTPException(400, { message: 'El destino no puede ser otro enlace de tarjetas.' });
			const stored = await this.db.execute({ sql: 'SELECT id FROM cards WHERE public_url = ?', args: [targetUrl.split(/[?#]/)[0]] });
			if (stored.rows.length) throw new HTTPException(400, { message: 'El destino no puede ser otro enlace de tarjetas.' });
		}
		let designId: string | null = null;
		if (data.designId !== null && data.designId !== undefined && data.designId !== '') {
			if (typeof data.designId !== 'string') throw new HTTPException(400, { message: 'Diseño no válido.' });
			designId = validId(data.designId);
			const design = await this.db.execute({ sql: 'SELECT id FROM gallery_images WHERE id = ?', args: [designId] });
			if (!design.rows.length) throw new HTTPException(400, { message: 'El diseño seleccionado ya no existe.' });
		}
		return [reference, clientName, targetUrl, designId, data.status] satisfies InValue[];
	}
	private writeError(error: unknown): never {
		if (error instanceof Error && 'code' in error && String(error.code).startsWith('SQLITE_CONSTRAINT') && error.message.includes('cards.reference')) throw new HTTPException(409, { message: 'Ya existe una tarjeta con ese nombre.' });
		throw error;
	}
	async create(input: unknown) {
		const id = crypto.randomUUID();
		const origin = new URL(this.publicOrigin);
		if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.username || origin.password || origin.search || origin.hash) throw new Error('Invalid card public origin configuration');
		const publicUrl = new URL(`/t/${id}`, origin).href;
		const values = await this.values(input, publicUrl);
		try { await this.db.execute({ sql: 'INSERT INTO cards (reference, client_name, target_url, design_id, status, id, public_url) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [...values, id, publicUrl] }); } catch (error) { this.writeError(error); }
		return this.get(id);
	}
	async update(id: string, input: unknown) {
		const existing = await this.get(id);
		const values = await this.values(input, existing.publicUrl);
		try { await this.db.execute({ sql: "UPDATE cards SET reference = ?, client_name = ?, target_url = ?, design_id = ?, status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", args: [...values, id] }); } catch (error) { this.writeError(error); }
		return this.get(id);
	}
	async setStatus(id: string, input: unknown) {
		validId(id);
		if (input !== 'active' && input !== 'paused') throw new HTTPException(400, { message: 'Estado no válido.' });
		const result = await this.db.execute({ sql: "UPDATE cards SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND status <> 'free' RETURNING id", args: [input, id] });
		if (!result.rows.length) { await this.get(id); throw new HTTPException(409, { message: 'Asigna un cliente y un destino antes de activar la tarjeta.' }); }
		return this.get(id);
	}
	async release(id: string) {
		validId(id);
		await this.db.execute({ sql: "UPDATE cards SET client_name = '', target_url = '', status = 'free', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", args: [id] });
		return this.get(id);
	}
	async destination(id: string) {
		if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return null;
		const result = await this.db.execute({ sql: "SELECT target_url FROM cards WHERE id = ? AND status = 'active'", args: [id] });
		return result.rows.length ? text(result.rows[0].target_url) : null;
	}
}
