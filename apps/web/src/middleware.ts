import { clerkMiddleware } from '@clerk/astro/server';
import type { MiddlewareHandler } from 'astro';

// Deny by default: every page requires a session except these
const PUBLIC_PATHS = ['/login'];

function isPublicPath(pathname: string): boolean {
	return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

const authenticate = clerkMiddleware((auth, context) => {
	const { isAuthenticated, redirectToSignIn } = auth();

	if (!isAuthenticated && !isPublicPath(context.url.pathname)) {
		return redirectToSignIn();
	}
});

// Temporary production diagnostics: fixed codes only, never error details.
export const onRequest: MiddlewareHandler = async (context, next) => {
	try {
		const response = await authenticate(context, next);
		if (!(response instanceof Response)) throw new Error('Authentication middleware returned no response.');
		response.headers.set('X-Altaria-Server', 'middleware-v1');
		return response;
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : '';
		const code = /publishable/i.test(message) ? 'AUTH_PUBLIC_KEY'
			: /secret.?key/i.test(message) ? 'AUTH_SECRET_KEY'
				: /handshake/i.test(message) ? 'AUTH_HANDSHAKE'
					: /environment|env.*variable/i.test(message) ? 'ENVIRONMENT'
						: /module|ENOENT|manifest/i.test(message) ? 'RUNTIME_FILES'
							: /invalid url/i.test(message) ? 'REQUEST_URL' : 'SERVER_ERROR';
		console.error(JSON.stringify({ message: 'web request failed', code, errorName: cause instanceof Error ? cause.name : 'Unknown', path: context.url.pathname }));
		return new Response(`No se pudo cargar la aplicación. Código: ${code}.`, {
			status: 500,
			headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Altaria-Error': code, 'X-Altaria-Server': 'middleware-v1' },
		});
	}
};
