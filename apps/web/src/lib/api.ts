import { PUBLIC_API_URL } from 'astro:env/client';

export class ApiError extends Error {
	readonly status: number;

	constructor(status: number, message?: string) {
		super(message ?? (status === 401 ? 'Tu sesión ha caducado. Vuelve a iniciar sesión.' : 'No se pudo completar la operación. Inténtalo de nuevo.'));
		this.name = 'ApiError';
		this.status = status;
	}
}

/**
 * Calls the API Worker with the Clerk session token as a Bearer header.
 * Get the token with `getToken()` right before each call: it lives ~60s.
 */
export async function apiFetch<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
	const headers = new Headers(init.headers);
	if (token) {
		headers.set('Authorization', `Bearer ${token}`);
	}

	const response = await fetch(new URL(path, PUBLIC_API_URL), { ...init, headers });
	if (!response.ok) {
		let message: string | undefined;
		try {
			const body: unknown = await response.json();
			if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') message = body.error;
		} catch { /* Gateways may return a non-JSON error page. */ }
		throw new ApiError(response.status, message);
	}

	const data: unknown = await response.json();
	return data as T;
}
