import type { APIRoute } from 'astro';
import { PUBLIC_API_URL } from 'astro:env/client';

// <img> cannot send the API's Bearer header. Clerk protects this same-origin
// endpoint, which streams the file using a fresh token on every upstream call.
export const GET: APIRoute = async ({ params, locals, request }) => {
	const headers = new Headers({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
	const id = params.id ?? '';
	if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Imagen no válida.', { status: 400, headers });
	const token = await locals.auth().getToken();
	if (!token) return new Response('No autorizado.', { status: 401, headers });
	try {
		const upstream = await fetch(new URL(`/v1/gallery/images/${encodeURIComponent(id)}/file`, PUBLIC_API_URL), {
			headers: { Authorization: `Bearer ${token}` }, signal: request.signal,
		});
		if (!upstream.ok) {
			await upstream.body?.cancel();
			return new Response('No se pudo cargar la imagen.', { status: upstream.status, headers });
		}
		for (const name of ['Content-Type', 'Content-Length', 'Content-Disposition']) {
			const value = upstream.headers.get(name);
			if (value) headers.set(name, value);
		}
		return new Response(upstream.body, { headers });
	} catch { return new Response('No se pudo cargar la imagen.', { status: 502, headers }); }
};
