export class ApiError extends Error {
	readonly status: number;

	constructor(status: number) {
		super(`La API respondió ${status}`);
		this.name = 'ApiError';
		this.status = status;
	}
}

/**
 * Calls the API Worker with the Clerk session token as a Bearer header.
 * Get the token with `getToken()` right before each call: it lives ~60s.
 */
export async function apiFetch<T>(apiUrl: string, path: string, token: string | null, init: RequestInit = {}): Promise<T> {
	const headers = new Headers(init.headers);
	if (token) {
		headers.set('Authorization', `Bearer ${token}`);
	}

	const response = await fetch(new URL(path, apiUrl), { ...init, headers });
	if (!response.ok) {
		throw new ApiError(response.status);
	}

	const data: unknown = await response.json();
	return data as T;
}
