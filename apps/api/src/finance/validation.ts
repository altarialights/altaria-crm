import { HTTPException } from 'hono/http-exception';

export type FinanceKind = 'income' | 'expense';
export type Frequency = 'monthly' | 'quarterly' | 'yearly';
export function bad(message: string, status: 400 | 404 | 409 | 413 | 415 | 503 = 400): never { throw new HTTPException(status, { message }); }
export function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) bad('Datos no válidos.');
	return value as Record<string, unknown>;
}
export function text(value: unknown, label: string, max: number, required = false, multiline = false) {
	if (value === undefined && !required) return '';
	if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || [...value].some((char) => (char.charCodeAt(0) < 32 && !(multiline && '\n\r\t'.includes(char))) || char.charCodeAt(0) === 127)) bad(`${label}: introduce un valor válido de hasta ${max} caracteres.`);
	return value.trim().normalize('NFC');
}
export function kind(value: unknown): FinanceKind { if (value !== 'income' && value !== 'expense') bad('Tipo de movimiento no válido.'); return value; }
export function frequency(value: unknown): Frequency { if (value !== 'monthly' && value !== 'quarterly' && value !== 'yearly') bad('Frecuencia no válida.'); return value; }
export function version(value: unknown) { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) bad('Versión no válida. Actualiza la lista.'); return value; }
export function conflict(): never { return bad('Este registro ha cambiado. Actualiza la lista antes de guardar.', 409); }
export function date(value: unknown, label = 'Fecha') {
	const parsed = typeof value === 'string' ? new Date(`${value}T12:00:00Z`) : new Date(NaN);
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '2000-01-01' || value > '2099-12-31' || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) bad(`${label}: selecciona una fecha válida entre 2000 y 2099.`);
	return value;
}
export function today(now = new Date()) {
	const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
	return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)!.value).join('-');
}
// Keep the original day: Jan 31 -> Feb 28 -> Mar 31, including leap years.
export function nextDue(previous: string, interval: Frequency, anchorDay: number) {
	const [year, month] = previous.split('-').map(Number);
	const next = new Date(Date.UTC(year, month - 1 + { monthly: 1, quarterly: 3, yearly: 12 }[interval], 1));
	const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
	next.setUTCDate(Math.min(anchorDay, lastDay));
	return next.toISOString().slice(0, 10);
}
export function pagination(page = 1, pageSize = 20) {
	if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) bad('Paginación no válida.');
	return { page, pageSize };
}
