export type FinanceKind = 'income' | 'expense';
export type Frequency = 'monthly' | 'quarterly' | 'yearly';
export const FREQUENCIES = [{ id: 'monthly', label: 'Mensual' }, { id: 'quarterly', label: 'Trimestral' }, { id: 'yearly', label: 'Anual' }] as const;
export type Category = { id: string; kind: FinanceKind; name: string; version: number };
type Details = { id: string; kind: FinanceKind; concept: string; amountCents: number; categoryId: string | null; categoryName: string | null; clientId: string | null; clientName: string | null; notes: string; version: number };
export type Entry = Details & { dueOn: string; status: 'pending' | 'settled'; paidOn: string | null; seriesId: string | null; frequency: Frequency | null; seriesActive: boolean; attachment: { name: string; type: string; size: number; url: string } | null; createdAt: string };
export type Series = Details & { frequency: Frequency; startsOn: string; endsOn: string | null; nextDueOn: string | null; state: 'active' | 'cancelled' | 'completed' };
export type Summary = { received: number; paid: number; balance: number; pendingIncome: number; pendingExpense: number };
export type Listing = { entries: Entry[]; total: number; page: number; pageSize: number; summary: Summary };
export type SeriesListing = { series: Series[]; total: number; page: number; pageSize: number };
export type FinanceRequest = <T>(path: string, init?: RequestInit) => Promise<T>;
export type FinanceFilters = { from: string; to: string; categoryId: string; status: string; recurrence: string; clientId: string; clientName: string };
export const emptyFilters: FinanceFilters = { from: '', to: '', categoryId: '', status: '', recurrence: '', clientId: '', clientName: '' };
export const emptySummary: Summary = { received: 0, paid: 0, balance: 0, pendingIncome: 0, pendingExpense: 0 };
const currency = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
export const money = (cents: number) => currency.format(cents / 100);
export const displayDate = (value: string) => value.split('-').reverse().join('/');
export const frequencyLabel = (value: Frequency | null) => FREQUENCIES.find((item) => item.id === value)?.label ?? 'Puntual';
export function currentDate() {
	const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
	return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)!.value).join('-');
}
export function parseAmount(value: string): number | null {
	const match = /^(\d{1,8})(?:[.,](\d{1,2}))?$/.exec(value.trim());
	if (!match) return null;
	const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
	return cents > 0 && cents <= 9999999999 ? cents : null;
}
