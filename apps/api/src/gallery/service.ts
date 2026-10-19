import type { Client, InValue, Row } from '@libsql/client/web';
import { HTTPException } from 'hono/http-exception';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = MAX_IMAGE_BYTES + 64 * 1024;
export const IMAGE_PAGE_SIZE = 24;

type Bucket = Pick<R2Bucket, 'put' | 'get' | 'delete'>;
function text(value: unknown): string {
	if (typeof value !== 'string') throw new Error('Unexpected gallery database column type');
	return value;
}
export type GalleryFolder = { id: string; name: string; storagePrefix: string; imageCount: number };
export type GalleryImage = {
	id: string; folderId: string; folderName: string; name: string; originalFilename: string;
	contentType: string; sizeBytes: number; createdAt: string;
};

function folder(row: Row): GalleryFolder {
	return { id: text(row.id), name: text(row.name), storagePrefix: text(row.storage_prefix), imageCount: Number(row.image_count ?? 0) };
}
function image(row: Row): GalleryImage {
	return {
		id: text(row.id), folderId: text(row.folder_id), folderName: text(row.folder_name), name: text(row.name),
		originalFilename: text(row.original_filename), contentType: text(row.content_type), sizeBytes: Number(row.size_bytes), createdAt: text(row.created_at),
	};
}
export function validId(value: string) {
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
		throw new HTTPException(400, { message: 'Identificador no válido.' });
	}
	return value;
}
function validName(value: unknown, max: number) {
	if (typeof value !== 'string' || !value.trim() || value.trim().length > max || [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
		throw new HTTPException(400, { message: `Introduce un nombre de entre 1 y ${max} caracteres.` });
	}
	return value.trim().normalize('NFC');
}
function isConstraint(error: unknown) {
	return error instanceof Error && 'code' in error && String(error.code).startsWith('SQLITE_CONSTRAINT');
}

/** Inspect the file signature rather than trusting its filename or browser MIME type. */
function imageFormat(bytes: Uint8Array): { type: string; extension: string } | null {
	const ascii = (start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));
	if (bytes.length >= 8 && bytes[0] === 137 && ascii(1, 3) === 'PNG' && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) return { type: 'image/png', extension: 'png' };
	if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { type: 'image/jpeg', extension: 'jpg' };
	if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return { type: 'image/webp', extension: 'webp' };
	if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6))) return { type: 'image/gif', extension: 'gif' };
	if (bytes.length >= 16 && ascii(4, 4) === 'ftyp') {
		const boxLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
		for (let offset = 8; offset + 4 <= Math.min(boxLength, bytes.length); offset += 4) {
			if (offset !== 12 && ['avif', 'avis'].includes(ascii(offset, 4))) return { type: 'image/avif', extension: 'avif' };
		}
	}
	return null;
}

export class GalleryService {
	constructor(private readonly db: Client, private readonly bucket: Bucket) {}

	async listFolders() {
		const rows = await this.db.execute(`SELECT f.*, count(i.id) AS image_count FROM gallery_folders f
			LEFT JOIN gallery_images i ON i.folder_id = f.id GROUP BY f.id ORDER BY f.name COLLATE NOCASE, f.id`);
		return rows.rows.map(folder);
	}
	async createFolder(input: unknown) {
		const name = validName(input, 100);
		const id = crypto.randomUUID();
		const base = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80).replace(/-$/, '') || 'carpeta';
		const existing = await this.db.execute({ sql: 'SELECT id FROM gallery_folders WHERE storage_prefix = ?', args: [base] });
		const prefix = existing.rows.length ? `${base}-${id.slice(0, 8)}` : base;
		try {
			await this.db.execute({ sql: 'INSERT INTO gallery_folders (id, name, storage_prefix) VALUES (?, ?, ?)', args: [id, name, prefix] });
		} catch (error) {
			if (isConstraint(error)) throw new HTTPException(409, { message: 'Ya existe una carpeta con ese nombre. Elige otro nombre.' });
			throw error;
		}
		return { id, name, storagePrefix: prefix, imageCount: 0 };
	}
	async renameFolder(id: string, input: unknown) {
		validId(id);
		const name = validName(input, 100);
		try {
			const result = await this.db.execute({ sql: "UPDATE gallery_folders SET name = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? RETURNING id", args: [name, id] });
			if (!result.rows.length) throw new HTTPException(404, { message: 'La carpeta ya no existe.' });
		} catch (error) {
			if (isConstraint(error)) throw new HTTPException(409, { message: 'Ya existe una carpeta con ese nombre.' });
			throw error;
		}
		return { id, name };
	}
	async deleteFolder(id: string) {
		validId(id);
		const result = await this.db.execute({
			sql: 'DELETE FROM gallery_folders WHERE id = ? AND NOT EXISTS (SELECT 1 FROM gallery_images WHERE folder_id = ?) RETURNING id', args: [id, id],
		});
		if (!result.rows.length) {
			const existing = await this.db.execute({ sql: 'SELECT id FROM gallery_folders WHERE id = ?', args: [id] });
			throw new HTTPException(existing.rows.length ? 409 : 404, { message: existing.rows.length ? 'Vacía la carpeta antes de eliminarla.' : 'La carpeta ya no existe.' });
		}
	}
	async listImages(options: { folderId?: string; search?: string; page?: number }) {
		const conditions: string[] = [];
		const args: InValue[] = [];
		if (options.folderId) { conditions.push('i.folder_id = ?'); args.push(validId(options.folderId)); }
		const search = options.search?.trim() ?? '';
		if (search.length > 200) throw new HTTPException(400, { message: 'La búsqueda es demasiado larga.' });
		if (search) { conditions.push("(i.name LIKE ? ESCAPE '\\' OR i.original_filename LIKE ? ESCAPE '\\')"); const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`; args.push(pattern, pattern); }
		const page = options.page ?? 1;
		if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new HTTPException(400, { message: 'Página no válida.' });
		const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
		const result = await this.db.batch([
			{ sql: `SELECT count(*) AS total FROM gallery_images i ${where}`, args },
			{ sql: `SELECT i.*, f.name AS folder_name FROM gallery_images i JOIN gallery_folders f ON f.id = i.folder_id ${where}
				ORDER BY i.created_at DESC, i.id DESC LIMIT ? OFFSET ?`, args: [...args, IMAGE_PAGE_SIZE, (page - 1) * IMAGE_PAGE_SIZE] },
		], 'read');
		return { images: result[1].rows.map(image), total: Number(result[0].rows[0].total), page, pageSize: IMAGE_PAGE_SIZE };
	}
	async upload(folderId: string, file: File) {
		validId(folderId);
		if (!file.size || file.size > MAX_IMAGE_BYTES) throw new HTTPException(413, { message: 'La imagen debe ocupar entre 1 byte y 10 MB.' });
		const format = imageFormat(new Uint8Array(await file.slice(0, 64).arrayBuffer()));
		if (!format) throw new HTTPException(415, { message: 'El archivo no es una imagen JPEG, PNG, WebP, GIF o AVIF válida.' });
		const originalName = validName(file.name, 255);
		const result = await this.db.execute({ sql: 'SELECT storage_prefix FROM gallery_folders WHERE id = ?', args: [folderId] });
		if (!result.rows.length) throw new HTTPException(404, { message: 'La carpeta ya no existe.' });
		const id = crypto.randomUUID();
		const key = `${text(result.rows[0].storage_prefix)}/${id}.${format.extension}`;
		const name = (originalName.replace(/\.[^.]+$/, '') || originalName).slice(0, 200);
		const stored = await this.bucket.put(key, file, { httpMetadata: { contentType: format.type } });
		if (!stored) throw new HTTPException(503, { message: 'No se pudo guardar la imagen. Inténtalo de nuevo.' });
		try {
			await this.db.execute({ sql: `INSERT INTO gallery_images (id, folder_id, name, object_key, original_filename, content_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?)`, args: [id, folderId, name, key, originalName, format.type, file.size] });
		} catch (error) {
			// R2 and SQL cannot share a transaction. Compensate if saving metadata fails.
			try { await this.bucket.delete(key); } catch { console.error(JSON.stringify({ message: 'gallery upload cleanup failed', objectKey: key })); }
			throw error;
		}
		return { id, name };
	}
	async renameImage(id: string, input: unknown) {
		validId(id);
		const name = validName(input, 200);
		const result = await this.db.execute({ sql: "UPDATE gallery_images SET name = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? RETURNING id", args: [name, id] });
		if (!result.rows.length) throw new HTTPException(404, { message: 'La imagen ya no existe.' });
		return { id, name };
	}
	private async imageRecord(id: string) {
		validId(id);
		const result = await this.db.execute({ sql: 'SELECT * FROM gallery_images WHERE id = ?', args: [id] });
		if (!result.rows.length) throw new HTTPException(404, { message: 'La imagen ya no existe.' });
		return result.rows[0];
	}
	async readImage(id: string) {
		const record = await this.imageRecord(id);
		const object = await this.bucket.get(text(record.object_key));
		if (!object || !('body' in object)) throw new HTTPException(404, { message: 'No se encuentra el archivo de esta imagen.' });
		const headers = new Headers({
			'Content-Type': text(record.content_type), 'Content-Length': String(object.size),
			'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
			'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(text(record.original_filename)).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`,
		});
		return new Response(object.body, { headers });
	}
	async deleteImage(id: string) {
		const record = await this.imageRecord(id);
		// Leave the row in place on R2 failure, so the operation can be retried.
		await this.bucket.delete(text(record.object_key));
		await this.db.execute({ sql: 'DELETE FROM gallery_images WHERE id = ?', args: [id] });
	}
}
