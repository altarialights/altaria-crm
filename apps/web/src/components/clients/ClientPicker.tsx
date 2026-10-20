import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ClientListing, ClientRequest } from '../../lib/clients';
import { errorMessage, fieldClass, secondaryButton } from '../../lib/gallery';

export default function ClientPicker({ selected, onChange, request }: {
	selected: { id: string | null; name: string } | null; onChange: (client: { id: string; name: string } | null) => void; request: ClientRequest;
}) {
	const [search, setSearch] = useState(''); const [page, setPage] = useState(1);
	const [listing, setListing] = useState<ClientListing | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
	useEffect(() => {
		if (selected) return;
		const controller = new AbortController();
		const timer = setTimeout(() => {
			setLoading(true); setError('');
			void request<ClientListing>(`?${new URLSearchParams({ search, page: String(page), pageSize: '5' })}`, { signal: controller.signal }).then((data) => { if (!controller.signal.aborted) setListing(data); }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorMessage(cause)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
		}, 200);
		return () => { clearTimeout(timer); controller.abort(); };
	}, [selected, search, page, request]);
	if (selected) return <div className="flex items-center gap-3 rounded-lg border border-ink-200 bg-brand-50 px-3 py-2"><span className="min-w-0 flex-1 truncate text-sm">{selected.name}</span><button type="button" aria-label="Cambiar cliente" onClick={() => onChange(null)} className="rounded-md p-1.5 text-ink-500 hover:bg-brand-100"><X className="size-4" /></button></div>;
	return <div className="rounded-lg border border-ink-200 p-3">
		<label className="relative block"><span className="sr-only">Buscar cliente para la tarjeta</span><Search className="pointer-events-none absolute top-3 left-3 size-4 text-ink-400" /><input type="search" maxLength={200} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar cliente…" className={`${fieldClass} pl-9`} /></label>
		{error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : loading ? <p role="status" className="mt-3 text-sm text-ink-500">Cargando clientes…</p> : <ul className="mt-2 space-y-1">{listing?.clients.map((client) => <li key={client.id}><button type="button" aria-label={`Seleccionar cliente ${client.name}`} onClick={() => onChange({ id: client.id, name: client.name })} className="w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-brand-50"><span className="block font-medium">{client.name}</span>{(client.company || client.email) && <span className="mt-0.5 block truncate text-xs text-ink-500">{[client.company, client.email].filter(Boolean).join(' · ')}</span>}</button></li>)}</ul>}
		{listing?.total === 0 && !loading && <p className="mt-3 text-sm text-ink-500">No hay clientes con ese nombre. <a href="/clientes/lista" target="_blank" rel="noopener noreferrer" className="text-brand-600 underline">Crear un cliente</a></p>}
		{listing && listing.total > 5 && <div className="mt-2 flex items-center justify-between gap-2 text-xs text-ink-500"><button type="button" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)} className={`${secondaryButton} py-1`}>Anterior</button><span>{page} / {Math.ceil(listing.total / 5)}</span><button type="button" disabled={loading || page * 5 >= listing.total} onClick={() => setPage((value) => value + 1)} className={`${secondaryButton} py-1`}>Siguiente</button></div>}
	</div>;
}
