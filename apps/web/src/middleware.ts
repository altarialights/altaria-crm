import { clerkMiddleware } from '@clerk/astro/server';
import type { MiddlewareHandler } from 'astro';
import { authErrorCode, describePublishableKey } from './lib/auth-diagnostics';

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
		response.headers.set('X-Altaria-Server', 'middleware-v2');
		return response;
	} catch (cause) {
		const runtimeKey = process.env.PUBLIC_CLERK_PUBLISHABLE_KEY;
		const configuredBuildKey: unknown = import.meta.env.PUBLIC_CLERK_PUBLISHABLE_KEY;
		const buildKey = typeof configuredBuildKey === 'string' ? configuredBuildKey : undefined;
		const code = authErrorCode(cause, runtimeKey || buildKey);
		console.error(JSON.stringify({
			message: 'web request failed', code, errorName: cause instanceof Error ? cause.name : 'Unknown',
			path: context.url.pathname,
			publicKey: describePublishableKey(runtimeKey || buildKey),
			publicKeySource: runtimeKey ? 'runtime' : buildKey ? 'build' : 'missing',
			buildPublicKey: describePublishableKey(buildKey),
			secretKeyPresent: Boolean(process.env.CLERK_SECRET_KEY || import.meta.env.CLERK_SECRET_KEY),
		}));
		return new Response(`No se pudo cargar la aplicación. Código: ${code}.`, {
			status: 500,
			headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Altaria-Error': code, 'X-Altaria-Server': 'middleware-v2' },
		});
	}
};
