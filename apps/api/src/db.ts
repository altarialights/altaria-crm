import { createClient, type Client } from '@libsql/client/web';

/**
 * Turso client over HTTP. Create one per request: it holds no connection,
 * and Workers must not share I/O objects across requests.
 */
export function createDb(env: CloudflareBindings): Client {
	return createClient({
		url: env.TURSO_DATABASE_URL,
		authToken: env.TURSO_AUTH_TOKEN,
	});
}
