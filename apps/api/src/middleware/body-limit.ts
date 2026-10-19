import { bodyLimit } from 'hono/body-limit';
import { createMiddleware } from 'hono/factory';
import { MAX_UPLOAD_BYTES } from '../gallery/service';
import type { AppEnv } from '../types';

/** Run after authentication. Only image uploads get the larger multipart budget. */
export const requestBodyLimit = createMiddleware<AppEnv>((c, next) => {
	const upload = c.req.method === 'POST' && /^\/v1\/gallery\/folders\/[^/]+\/images\/?$/.test(c.req.path);
	return bodyLimit({
		maxSize: upload ? MAX_UPLOAD_BYTES : 1024 * 1024,
		onError: (context) => context.json({ error: upload ? 'El archivo supera el límite permitido de 10 MB.' : 'La petición supera el límite permitido de 1 MB.' }, 413),
	})(c, next);
});
