export type CardStatus = 'free' | 'active' | 'paused';
export type Card = {
	id: string; reference: string; publicUrl: string; clientName: string; clientId: string | null; targetUrl: string;
	designId: string | null; designName: string | null; status: CardStatus; createdAt: string; updatedAt: string;
};
export type CardListing = { cards: Card[]; total: number; page: number; pageSize: number };
export const statusLabel: Record<CardStatus, string> = { free: 'Libre', active: 'Activa', paused: 'Pausada' };
export const statusStyle: Record<CardStatus, string> = { free: 'bg-brand-50 text-brand-700', active: 'bg-emerald-50 text-emerald-700', paused: 'bg-amber-50 text-amber-800' };
export type CardRequest = <T>(path: string, init?: RequestInit) => Promise<T>;
