import { bodyLimit } from 'hono/body-limit';
import { createMiddleware } from 'hono/factory';
import { MAX_UPLOAD_BYTES } from '../gallery/service';
import type { AppEnv } from '../types';

/** Run after authentication. Only image uploads get the larger multipart budget. */
export const requestBodyLimit = createMiddleware<AppEnv>((c, next) => {
	const multipart = c.req.header('Content-Type')?.toLowerCase().startsWith('multipart/form-data');
	const upload = (c.req.method === 'POST' && /^\/v1\/gallery\/folders\/[^/]+\/images\/?$/.test(c.req.path))
		|| (multipart && ((c.req.method === 'POST' && /^\/v1\/clients\/?$/.test(c.req.path)) || (c.req.method === 'PATCH' && /^\/v1\/clients\/[^/]+\/?$/.test(c.req.path))));
	const financeUpload = multipart && ((c.req.method === 'POST' && /^\/v1\/finance\/entries\/?$/.test(c.req.path)) || (c.req.method === 'PATCH' && /^\/v1\/finance\/entries\/[^/]+\/?$/.test(c.req.path)));
	return bodyLimit({
		maxSize: upload || financeUpload ? MAX_UPLOAD_BYTES : 1024 * 1024,
		onError: (context) => context.json({ error: upload || financeUpload ? 'El archivo supera el límite permitido de 10 MB.' : 'La petición supera el límite permitido de 1 MB.' }, 413),
	})(c, next);
});
