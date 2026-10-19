import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { createClient } from '@libsql/client';

const migrationsDirectory = new URL('../migrations/', import.meta.url);

/** Apply each SQL file and its tracking row atomically; never run on API requests. */
export async function applyMigrations(db, directory = migrationsDirectory) {
	const files = (await readdir(directory)).filter((file) => /^\d+_[a-z0-9_]+\.sql$/.test(file)).sort();
	await db.execute(`CREATE TABLE IF NOT EXISTS _schema_migrations (
		name TEXT PRIMARY KEY NOT NULL,
		checksum TEXT NOT NULL,
		applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
	)`);

	const applied = [];
	for (const name of files) {
		const sql = (await readFile(new URL(name, directory), 'utf8')).replaceAll('\r\n', '\n');
		const checksum = createHash('sha256').update(sql).digest('hex');
		const transaction = await db.transaction('write');
		try {
			const result = await transaction.execute({ sql: 'SELECT checksum FROM _schema_migrations WHERE name = ?', args: [name] });
			if (result.rows.length) {
				if (result.rows[0].checksum !== checksum) throw new Error(`Applied migration was modified: ${name}`);
				await transaction.commit();
				continue;
			}
			await transaction.executeMultiple(sql);
			await transaction.execute({ sql: 'INSERT INTO _schema_migrations (name, checksum) VALUES (?, ?)', args: [name, checksum] });
			await transaction.commit();
			applied.push(name);
		} finally {
			transaction.close();
		}
	}
	return applied;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
	if (!process.env.TURSO_DATABASE_URL) {
		console.error('Missing TURSO_DATABASE_URL. Set it in apps/api/.dev.vars or in the environment.');
		process.exitCode = 1;
	} else {
		const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
		try {
			const applied = await applyMigrations(db);
			console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
		} catch (error) {
			// Avoid printing connection URLs, tokens, or remote response bodies.
			console.error('Migration failed.', error instanceof Error && 'code' in error ? error.code : 'Check migration SQL and database access.');
			process.exitCode = 1;
		} finally {
			db.close();
		}
	}
}
