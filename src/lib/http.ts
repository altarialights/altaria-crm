export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers || {}),
    },
  });
}

export function badRequest(message: string): Response {
  return json({ ok: false, error: message }, { status: 400 });
}

export function unauthorized(message = "No autenticado"): Response {
  return json({ ok: false, error: message }, { status: 401 });
}

export function forbidden(message = "Sin permisos"): Response {
  return json({ ok: false, error: message }, { status: 403 });
}

export function notFound(message = "No encontrado"): Response {
  return json({ ok: false, error: message }, { status: 404 });
}

export function serverError(error: unknown): Response {
  console.error(error);
  return json({ ok: false, error: "Error interno del servidor" }, { status: 500 });
}

export async function readJson<T = any>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

export function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

export function optionalString(value: unknown): string | null {
  const cleaned = cleanString(value);
  return cleaned.length > 0 ? cleaned : null;
}

export function intCents(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function centsToNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Math.round(n) / 100;
}
