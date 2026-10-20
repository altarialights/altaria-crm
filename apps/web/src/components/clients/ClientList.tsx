import { ChevronLeft, ChevronRight, LoaderCircle, Pencil, Trash2, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { stageDetails, type Client, type ClientListing, type ClientRequest } from '../../lib/clients';
import { errorMessage, secondaryButton } from '../../lib/gallery';

export default function ClientList({ request, search, stage, refresh, onEdit, onDelete, onCreate }: {
	request: ClientRequest; search: string; stage: string; refresh: number; onEdit: (client: Client) => void; onDelete: (client: Client) => void; onCreate: () => void;
}) {
	const [listing, setListing] = useState<ClientListing>({ clients: [], page: 1, pageSize: 10, total: 0 });
	const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(0);
	const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
	const areaRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!areaRef.current) return;
		const observer = new ResizeObserver(([entry]) => setPageSize(Math.min(50, Math.max(1, Math.floor((entry.contentRect.height - 60) / 64)))));
		observer.observe(areaRef.current); return () => observer.disconnect();
	}, []);
	useEffect(() => {
		if (!pageSize) return;
		const controller = new AbortController();
		async function load() {
			setLoading(true); setError('');
			try {
				const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize), search, stage });
				const result = await request<ClientListing>(`?${query}`, { signal: controller.signal });
				if (controller.signal.aborted) return;
				const maxPage = Math.max(1, Math.ceil(result.total / result.pageSize));
				if (page > maxPage) { setPage(maxPage); return; } setListing(result);
			} catch (cause) { if (!controller.signal.aborted) setError(errorMessage(cause)); }
			finally { if (!controller.signal.aborted) setLoading(false); }
		}
		void load(); return () => controller.abort();
	}, [request, page, pageSize, search, stage, refresh, retry]);
	return <section aria-label="Lista de clientes" aria-busy={loading} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white p-4 sm:p-6">
		<div ref={areaRef} className="min-h-0 flex-1 overflow-x-auto">
			{error ? <div role="alert" className="rounded-xl bg-red-50 p-5 text-sm text-red-700"><p>{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-3 underline">Volver a intentar</button></div> : loading ? <div role="status" className="flex h-full items-center justify-center gap-2 text-sm text-ink-500"><LoaderCircle className="size-5 animate-spin" />Cargando clientes…</div> : !listing.clients.length ? <div className="flex h-full flex-col items-center justify-center gap-3 text-center"><Users className="size-9 text-brand-600" /><h2 className="font-semibold">{search || stage ? 'No hay clientes con esos filtros' : 'Tu primer cliente empieza aquí'}</h2><p className="max-w-md text-sm text-ink-500">{search || stage ? 'Prueba otra búsqueda o cambia la fase.' : 'Añade sus datos y sigue el avance de cada proyecto desde el tablero.'}</p>{!search && !stage && <button type="button" onClick={onCreate} className={secondaryButton}>Crear primer cliente</button>}</div> : <table className="w-full min-w-[880px] table-fixed text-left text-sm"><caption className="sr-only">Datos de los clientes</caption><thead><tr className="h-11 border-b border-ink-200 text-xs text-ink-500"><th scope="col" className="w-[22%] pr-4 font-medium">Cliente</th><th scope="col" className="w-[19%] pr-4 font-medium">Empresa</th><th scope="col" className="pr-4 font-medium">Contacto</th><th scope="col" className="w-48 pr-4 font-medium">Fase</th><th scope="col" className="w-24 text-right font-medium">Acciones</th></tr></thead><tbody>{listing.clients.map((client) => {
				const phase = stageDetails(client.stage);
				return <tr key={client.id} className="h-16 border-b border-ink-100 last:border-b-0"><td className="pr-4"><button type="button" onClick={() => onEdit(client)} className="block max-w-full truncate font-medium hover:text-brand-600" title={`Abrir ficha de ${client.name}`}>{client.name}</button></td><td className="truncate pr-4 text-ink-600" title={client.company}>{client.company || '—'}</td><td className="pr-4"><div className="space-y-1">{client.email && <a href={`mailto:${client.email}`} className="block truncate text-brand-600 hover:underline">{client.email}</a>}{client.phone && <a href={`tel:${client.phone.replace(/[^\d+]/g, '')}`} className="block truncate text-xs text-ink-500 hover:text-brand-600">{client.phone}</a>}{!client.email && !client.phone && <span className="text-ink-400">Sin datos de contacto</span>}</div></td><td className="pr-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${phase.style}`}>{phase.label}</span></td><td><div className="flex justify-end gap-1"><button type="button" aria-label={`Editar ${client.name}`} title="Editar cliente" onClick={() => onEdit(client)} className="rounded-lg p-2 text-ink-500 hover:bg-brand-50 hover:text-brand-600"><Pencil className="size-4" /></button><button type="button" aria-label={`Eliminar ${client.name}`} title="Eliminar cliente" onClick={() => onDelete(client)} className="rounded-lg p-2 text-ink-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="size-4" /></button></div></td></tr>;
			})}</tbody></table>}
		</div>
		<div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-ink-200 pt-4 text-xs text-ink-500"><p>{listing.total ? (page - 1) * listing.pageSize + 1 : 0}–{Math.min(page * listing.pageSize, listing.total)} de {listing.total} clientes</p><div className="flex items-center gap-3"><button type="button" aria-label="Página anterior" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-ink-200 p-2 disabled:opacity-30"><ChevronLeft className="size-4" /></button><span>{page} / {Math.max(1, Math.ceil(listing.total / listing.pageSize))}</span><button type="button" aria-label="Página siguiente" disabled={loading || page * listing.pageSize >= listing.total} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-ink-200 p-2 disabled:opacity-30"><ChevronRight className="size-4" /></button></div></div>
	</section>;
}
