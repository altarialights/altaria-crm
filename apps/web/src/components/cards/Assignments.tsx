import { useAuth } from '@clerk/astro/react';
import { CheckCircle2, ChevronLeft, ChevronRight, Copy, CreditCard, Link, LoaderCircle, Pause, Pencil, Play, Plus, QrCode, Search, Unlink, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { statusLabel, statusStyle, type Card, type CardListing, type CardRequest } from '../../lib/cards';
import { errorMessage, fieldClass, imageUrl, primaryButton, secondaryButton, type GalleryRequest } from '../../lib/gallery';
import Modal from '../gallery/Modal';
import CardForm from './CardForm';
import QrDialog from './QrDialog';

type Dialog = { kind: 'create' } | { kind: 'edit' | 'qr' | 'release'; card: Card };
const actionClass = 'rounded-lg p-2 text-ink-500 hover:bg-brand-50 hover:text-brand-600 disabled:opacity-40';

export default function Assignments() {
	const { getToken, isLoaded, isSignedIn } = useAuth();
	if (!isLoaded) return <><h1 className="text-2xl font-semibold tracking-tight">Asignaciones</h1><p role="status" className="mt-8 text-sm text-ink-500">Cargando asignaciones…</p></>;
	if (!isSignedIn) return <><h1 className="text-2xl font-semibold tracking-tight">Asignaciones</h1><p className="mt-8 text-sm text-ink-600">Vuelve a iniciar sesión para gestionar tus tarjetas.</p></>;
	return <AssignmentsView getToken={getToken} />;
}

export function AssignmentsView({ getToken }: { getToken: () => Promise<string | null> }) {
	const [listing, setListing] = useState<CardListing>({ cards: [], total: 0, page: 1, pageSize: 10 });
	const [searchInput, setSearchInput] = useState('');
	const [search, setSearch] = useState('');
	const [status, setStatus] = useState('');
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(0);
	const [refresh, setRefresh] = useState(0);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState('');
	const [notice, setNotice] = useState('');
	const [dialog, setDialog] = useState<Dialog | null>(null);
	const [busyId, setBusyId] = useState('');
	const [dialogError, setDialogError] = useState('');
	const tableAreaRef = useRef<HTMLDivElement>(null);
	const request: CardRequest = useCallback(async <T,>(path: string, init?: RequestInit) => apiFetch<T>(`/v1/cards${path}`, await getToken(), init), [getToken]);
	const galleryRequest: GalleryRequest = useCallback(async <T,>(path: string, init?: RequestInit) => apiFetch<T>(`/v1/gallery${path}`, await getToken(), init), [getToken]);
	useEffect(() => {
		const element = tableAreaRef.current;
		if (!element) return;
		const observer = new ResizeObserver(([entry]) => {
			const capacity = Math.min(50, Math.max(1, Math.floor((entry.contentRect.height - 44) / 80)));
			setPageSize((previous) => { return previous === capacity ? previous : capacity; });
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	useEffect(() => {
		const timer = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 250);
		return () => clearTimeout(timer);
	}, [searchInput]);
	useEffect(() => {
		if (!pageSize) return;
		const controller = new AbortController();
		async function load() {
			setLoading(true); setLoadError('');
			try {
				const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize), search, status });
				const data = await request<CardListing>(`?${query}`, { signal: controller.signal });
				if (controller.signal.aborted) return;
				const maxPage = Math.max(1, Math.ceil(data.total / data.pageSize));
				if (page > maxPage) { setPage(maxPage); return; }
				setListing(data);
			} catch (cause) { if (!controller.signal.aborted) setLoadError(errorMessage(cause)); }
			finally { if (!controller.signal.aborted) setLoading(false); }
		}
		void load();
		return () => controller.abort();
	}, [page, pageSize, search, status, refresh, request]);
	function open(value: Dialog) { setDialogError(''); setNotice(''); setDialog(value); }
	function saved(card: Card) {
		setDialog(null); setNotice(`Tarjeta «${card.reference}» guardada.`);
		setPage(1); setSearchInput(''); setSearch(''); setStatus(''); setRefresh((value) => value + 1);
	}
	async function copy(card: Card) {
		try { await navigator.clipboard.writeText(card.publicUrl); setNotice('Enlace QR y NFC copiado.'); }
		catch { open({ kind: 'qr', card }); }
	}
	async function changeStatus(card: Card) {
		if (busyId) return;
		setBusyId(card.id); setNotice('');
		try {
			const next = card.status === 'active' ? 'paused' : 'active';
			await request(`/${card.id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) });
			setRefresh((value) => value + 1); setNotice(next === 'paused' ? 'Tarjeta pausada.' : 'Tarjeta activada.');
		} catch (cause) { setLoadError(errorMessage(cause)); }
		finally { setBusyId(''); }
	}
	async function release() {
		if (dialog?.kind !== 'release' || busyId) return;
		setBusyId(dialog.card.id); setDialogError('');
		try { await request(`/${dialog.card.id}/release`, { method: 'POST' }); setDialog(null); setRefresh((value) => value + 1); setNotice('Tarjeta liberada. Su enlace se conserva para volver a asignarla.'); }
		catch (cause) { setDialogError(errorMessage(cause)); }
		finally { setBusyId(''); }
	}
	const totalPages = Math.max(1, Math.ceil(listing.total / listing.pageSize));
	return <div className="flex min-h-0 flex-1 flex-col">
		<div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3 sm:mb-6"><h1 className="text-2xl font-semibold tracking-tight">Asignaciones</h1><button type="button" onClick={() => open({ kind: 'create' })} className={primaryButton}><Plus className="size-4" />Nueva tarjeta</button></div>
		{notice && <div role="status" className="fixed top-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0" /><span>{notice}</span><button type="button" aria-label="Cerrar aviso" onClick={() => setNotice('')}><X className="size-4" /></button></div>}
		<section aria-label="Asignaciones de tarjetas" aria-busy={loading} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white p-4 sm:p-6">
			<div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
				<label className="relative min-w-0 flex-1 sm:max-w-sm"><span className="sr-only">Buscar tarjetas</span><Search className="pointer-events-none absolute top-3 left-3 size-4 text-ink-400" /><input type="search" placeholder="Buscar referencia, cliente o destino…" maxLength={200} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className={`${fieldClass} pl-9`} /></label>
				<label><span className="sr-only">Filtrar por estado</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className={fieldClass}><option value="">Todos los estados</option><option value="free">Libres</option><option value="active">Activas</option><option value="paused">Pausadas</option></select></label>
			</div>
			<div ref={tableAreaRef} className="min-h-0 flex-1 overflow-x-auto">
				{loadError ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"><p>{loadError}</p><button type="button" onClick={() => setRefresh((value) => value + 1)} className="mt-3 font-medium underline">Volver a intentar</button></div>
					: loading ? <div role="status" className="flex h-full items-center justify-center gap-3 text-sm text-ink-500"><LoaderCircle className="size-5 animate-spin" />Cargando tarjetas…</div>
						: !listing.cards.length ? <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center"><CreditCard className="size-9 text-brand-600" /><h2 className="font-semibold">{search || status ? 'No hay tarjetas con esos filtros' : 'Tu primera tarjeta empieza aquí'}</h2><p className="max-w-md text-sm text-ink-500">{search || status ? 'Prueba otra búsqueda o cambia el estado.' : 'Crea una tarjeta y configura el enlace que compartirán su QR y su NFC.'}</p>{!search && !status && <button type="button" onClick={() => open({ kind: 'create' })} className={secondaryButton}>Crear primera tarjeta</button>}</div>
							: <table className="w-full min-w-[880px] table-fixed text-left text-sm"><caption className="sr-only">Tarjetas físicas y sus asignaciones</caption><thead><tr className="h-11 border-b border-ink-200 text-xs font-medium text-ink-500"><th scope="col" className="w-[24%] pr-4 font-medium">Tarjeta / diseño</th><th scope="col" className="w-[20%] pr-4 font-medium">Cliente</th><th scope="col" className="pr-4 font-medium">Destino</th><th scope="col" className="w-24 font-medium">Estado</th><th scope="col" className="w-48 text-right font-medium">Acciones</th></tr></thead><tbody>{listing.cards.map((card) => <tr key={card.id} className="h-20 border-b border-ink-100 last:border-b-0">
								<td className="pr-4"><div className="flex min-w-0 items-center gap-3">{card.designId ? <img src={imageUrl(card.designId)} alt="" className="h-10 w-16 shrink-0 rounded-md bg-brand-50 object-contain" /> : <div className="grid h-10 w-12 shrink-0 place-items-center rounded-lg bg-brand-50"><CreditCard className="size-5 text-brand-600" /></div>}<div className="min-w-0"><p className="truncate font-medium" title={card.reference}>{card.reference}</p><p className="mt-1 truncate text-xs text-ink-400" title={card.designName ?? card.id}>{card.designName ?? card.id.slice(0, 8)}</p></div></div></td>
								<td className="truncate pr-4 text-ink-600" title={card.clientName}>{card.clientName || 'Sin asignar'}</td>
								<td className="pr-4">{card.targetUrl ? <a href={card.targetUrl} target="_blank" rel="noopener noreferrer" title={card.targetUrl} className="block truncate text-brand-600 hover:underline">{card.targetUrl}</a> : <span className="text-ink-400">Sin destino</span>}</td>
								<td><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle[card.status]}`}>{statusLabel[card.status]}</span></td>
								<td><div className="flex justify-end gap-0.5"><button type="button" aria-label={`Ver QR de ${card.reference}`} title="Mostrar QR" onClick={() => open({ kind: 'qr', card })} className={actionClass}><QrCode className="size-4" /></button><button type="button" aria-label={`Copiar enlace de ${card.reference}`} title="Copiar enlace QR y NFC" onClick={() => void copy(card)} className={actionClass}><Copy className="size-4" /></button><button type="button" aria-label={`Editar ${card.reference}`} title="Editar tarjeta" onClick={() => open({ kind: 'edit', card })} className={actionClass}><Pencil className="size-4" /></button>{card.status !== 'free' && <><button type="button" disabled={!!busyId} aria-label={`${card.status === 'active' ? 'Pausar' : 'Activar'} ${card.reference}`} title={card.status === 'active' ? 'Pausar tarjeta' : 'Activar tarjeta'} onClick={() => void changeStatus(card)} className={actionClass}>{busyId === card.id ? <LoaderCircle className="size-4 animate-spin" /> : card.status === 'active' ? <Pause className="size-4" /> : <Play className="size-4" />}</button><button type="button" aria-label={`Liberar ${card.reference}`} title="Liberar tarjeta" onClick={() => open({ kind: 'release', card })} className={`${actionClass} hover:text-amber-700`}><Unlink className="size-4" /></button></>}</div></td>
							</tr>)}</tbody></table>}
			</div>
			<div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-ink-200 pt-4 text-xs text-ink-500"><p>{listing.total ? (page - 1) * listing.pageSize + 1 : 0}–{Math.min(page * listing.pageSize, listing.total)} de {listing.total} tarjetas</p><div className="flex items-center gap-3"><button type="button" aria-label="Página anterior" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-ink-200 p-2 hover:bg-brand-50 disabled:opacity-30"><ChevronLeft className="size-4" /></button><span>{page} / {totalPages}</span><button type="button" aria-label="Página siguiente" disabled={loading || page >= totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-ink-200 p-2 hover:bg-brand-50 disabled:opacity-30"><ChevronRight className="size-4" /></button></div></div>
		</section>
		{dialog?.kind === 'create' || dialog?.kind === 'edit' ? <CardForm card={dialog.kind === 'edit' ? dialog.card : undefined} request={request} galleryRequest={galleryRequest} onClose={() => setDialog(null)} onSaved={saved} /> : dialog?.kind === 'qr' ? <QrDialog card={dialog.card} onClose={() => setDialog(null)} /> : dialog?.kind === 'release' && <Modal title="Liberar tarjeta" busy={!!busyId} onClose={() => setDialog(null)}><div className="p-6"><div className="mb-4 flex items-center gap-2 text-brand-600"><Link className="size-5" /><span className="text-sm font-medium">El QR y el NFC mantienen su enlace</span></div><p className="text-sm leading-6 text-ink-600">Se quitarán el cliente y el destino de <strong>{dialog.card.reference}</strong>. Dejará de redirigir hasta que vuelvas a asignarla. El diseño se conserva.</p>{dialogError && <p role="alert" className="mt-4 text-sm text-red-700">{dialogError}</p>}<div className="mt-6 flex justify-end gap-2"><button type="button" disabled={!!busyId} onClick={() => setDialog(null)} className={secondaryButton}>Cancelar</button><button type="button" disabled={!!busyId} onClick={() => void release()} className={primaryButton}>{busyId && <LoaderCircle className="size-4 animate-spin" />}Liberar tarjeta</button></div></div></Modal>}
	</div>;
}
