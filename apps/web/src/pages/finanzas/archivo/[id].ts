import type { APIRoute } from 'astro';
import { PUBLIC_API_URL } from 'astro:env/client';

export const GET: APIRoute = async ({ params, locals, request }) => {
	const headers = new Headers({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
	const id = params.id ?? '';
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return new Response('Justificante no válido.', { status: 400, headers });
	const token = await locals.auth().getToken(); if (!token) return new Response('No autorizado.', { status: 401, headers });
	try {
		const upstream = await fetch(new URL(`/v1/finance/entries/${encodeURIComponent(id)}/file`, PUBLIC_API_URL), { headers: { Authorization: `Bearer ${token}` }, signal: request.signal });
		if (!upstream.ok) { await upstream.body?.cancel(); return new Response('No se pudo descargar el justificante.', { status: upstream.status, headers }); }
		for (const name of ['Content-Type', 'Content-Length', 'Content-Disposition']) { const value = upstream.headers.get(name); if (value) headers.set(name, value); }
		return new Response(upstream.body, { headers });
	} catch { return new Response('No se pudo descargar el justificante.', { status: 502, headers }); }
};
