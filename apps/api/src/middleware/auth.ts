import { createClerkClient } from '@clerk/backend';
import { createMiddleware } from 'hono/factory';
import { parseOrigins } from '../lib/origins';
import type { AppEnv } from '../types';

/**
 * Verifies the Clerk session token sent as `Authorization: Bearer <token>`
 * and exposes the caller as `c.var.auth`. Rejects everything else with 401.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
	const clerk = createClerkClient({
		secretKey: c.env.CLERK_SECRET_KEY,
		publishableKey: c.env.CLERK_PUBLISHABLE_KEY,
	});

	const state = await clerk.authenticateRequest(c.req.raw, {
		acceptsToken: 'session_token',
		// Only tokens issued to our own web app (azp claim)
		authorizedParties: parseOrigins(c.env.WEB_ORIGINS),
	});

	if (!state.isAuthenticated) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	const { userId, sessionId, orgId } = state.toAuth();
	c.set('auth', { userId, sessionId, orgId: orgId ?? null });

	await next();
});
