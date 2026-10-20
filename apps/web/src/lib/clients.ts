export const CLIENT_STAGES = [
	{ id: 'uncontacted', label: 'Sin contactar', style: 'bg-ink-100 text-ink-600', dot: 'bg-ink-400' },
	{ id: 'first_contact', label: 'Primer contacto', style: 'bg-brand-50 text-brand-700', dot: 'bg-brand-400' },
	{ id: 'meeting_scheduled', label: 'Reunión agendada', style: 'bg-brand-100 text-brand-900', dot: 'bg-brand-500' },
	{ id: 'quote_sent', label: 'Presupuesto mandado', style: 'bg-amber-50 text-amber-800', dot: 'bg-amber-400' },
	{ id: 'quote_accepted', label: 'Presupuesto aceptado', style: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-400' },
	{ id: 'project_started', label: 'Proyecto iniciado', style: 'bg-brand-100 text-brand-900', dot: 'bg-brand-600' },
	{ id: 'project_finished', label: 'Proyecto finalizado', style: 'bg-emerald-50 text-emerald-800', dot: 'bg-emerald-600' },
] as const;
export type ClientStage = typeof CLIENT_STAGES[number]['id'];
export type Client = {
	id: string; name: string; company: string; logoUrl: string | null; email: string; phone: string; website: string; notes: string;
	stage: ClientStage; position: number; version: number; createdAt: string; updatedAt: string;
};
export type ClientListing = { clients: Client[]; total: number; page: number; pageSize: number };
export type ClientColumn = ClientListing & { stage: ClientStage };
export type ClientBoardData = { columns: ClientColumn[] };
export type ClientRequest = <T>(path: string, init?: RequestInit) => Promise<T>;
export function stageDetails(stage: ClientStage) { return CLIENT_STAGES.find((item) => item.id === stage) ?? CLIENT_STAGES[0]; }
