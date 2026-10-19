import { clerkMiddleware } from '@clerk/astro/server';

// Deny by default: every page requires a session except these
const PUBLIC_PATHS = ['/login'];

function isPublicPath(pathname: string): boolean {
	return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export const onRequest = clerkMiddleware((auth, context) => {
	const { isAuthenticated, redirectToSignIn } = auth();

	if (!isAuthenticated && !isPublicPath(context.url.pathname)) {
		return redirectToSignIn();
	}
});
