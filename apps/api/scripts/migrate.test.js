import assert from 'node:assert/strict';
import { mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { createClient } from '@libsql/client';
import { applyMigrations } from './migrate.js';

test('gallery supports empty folders, stable prefixes and images with enforced relationships', async () => {
	const db = createClient({ url: 'file::memory:' });
	try {
		await db.execute('PRAGMA foreign_keys = ON');
		assert.deepEqual(await applyMigrations(db), ['0001_card_gallery.sql', '0002_card_assignments.sql', '0003_clients.sql']);
		assert.deepEqual(await applyMigrations(db), []);
		await db.execute("INSERT INTO gallery_folders (id, name, storage_prefix) VALUES ('folder-1', 'Restaurantes', 'restaurantes')");
		await db.execute("INSERT INTO gallery_folders (id, name, storage_prefix) VALUES ('folder-2', 'Peluquerías', 'peluquerias')");
		const image = {
			sql: 'INSERT INTO gallery_images (id, folder_id, name, object_key, original_filename, content_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?)',
			args: ['image-1', 'folder-1', 'Carta del restaurante', 'restaurantes/image-1.webp', 'diseño.webp', 'image/webp', 2048],
		};
		await db.execute(image);
		await assert.rejects(db.execute({ ...image, args: ['image-2', 'missing-folder', 'Missing', 'missing/image-2.webp', 'image.webp', 'image/webp', 12] }), /FOREIGN KEY/);
		await assert.rejects(db.execute("DELETE FROM gallery_folders WHERE id = 'folder-1'"), /FOREIGN KEY/);
		await assert.rejects(db.execute({ ...image, args: ['image-2', 'folder-2', ...image.args.slice(2)] }), /UNIQUE/);
		await assert.rejects(db.execute({ ...image, args: ['image-2', 'folder-2', 'Invalid', 'peluquerias/image-2.webp', 'bad.webp', 'text/html', 12] }), /CHECK/);
		await assert.rejects(db.execute("INSERT INTO gallery_folders (id, name, storage_prefix) VALUES ('folder-3', 'Otro', '../otro')"), /CHECK/);
		await db.execute("UPDATE gallery_folders SET name = 'Hostelería' WHERE id = 'folder-1'");
		assert.equal((await db.execute("SELECT storage_prefix FROM gallery_folders WHERE id = 'folder-1'")).rows[0].storage_prefix, 'restaurantes');
		assert.equal((await db.execute("SELECT count(*) AS total FROM gallery_images WHERE folder_id = 'folder-2'")).rows[0].total, 0);
		await db.execute("DELETE FROM gallery_folders WHERE id = 'folder-2'");
	} finally {
		db.close();
	}
});

test('failed migrations roll back their schema and are not marked as applied', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'altaria-migrations-'));
	const db = createClient({ url: 'file::memory:' });
	try {
		await writeFile(join(directory, '0001_broken.sql'), 'CREATE TABLE partial (id TEXT); INSERT INTO missing_table VALUES (1);');
		await assert.rejects(applyMigrations(db, pathToFileURL(`${directory}/`)));
		assert.equal((await db.execute("SELECT name FROM sqlite_master WHERE name = 'partial'")).rows.length, 0);
		assert.equal((await db.execute('SELECT * FROM _schema_migrations')).rows.length, 0);
	} finally {
		db.close();
		await unlink(join(directory, '0001_broken.sql'));
		await rmdir(directory);
	}
});
