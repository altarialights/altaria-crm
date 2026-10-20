import { useAuth } from '@clerk/astro/react';
import { CheckCircle2, ChevronLeft, ChevronRight, Filter, LoaderCircle, Paperclip, Pencil, Plus, Receipt, RefreshCw, Repeat2, Search, Tags, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/api';
import type { ClientRequest } from '../../lib/clients';
import { currentDate, displayDate, emptyFilters, emptySummary, frequencyLabel, money, type Category, type Entry, type FinanceFilters, type FinanceKind, type FinanceRequest, type Listing, type Series } from '../../lib/finance';
import { errorMessage, fieldClass, primaryButton, secondaryButton } from '../../lib/gallery';
import Modal from '../gallery/Modal';
import CategoriesDialog from './CategoriesDialog';
import FilterDialog from './FilterDialog';
import FinanceForm from './FinanceForm';
import SeriesDialog from './SeriesDialog';

type Dialog = { kind: 'create' | 'filters' | 'categories' | 'series' } | { kind: 'edit' | 'delete'; entry: Entry } | { kind: 'editSeries'; series: Series };
export default function Finance({ kind }: { kind: FinanceKind }) {
	const { isLoaded, isSignedIn, getToken } = useAuth();
	if (!isLoaded) return <p role="status" className="text-sm text-ink-500">Cargando finanzas…</p>;
	if (!isSignedIn) return <p className="text-sm text-ink-600">Vuelve a iniciar sesión para gestionar tus finanzas.</p>;
	return <FinanceView kind={kind} getToken={getToken} />;
}
export function FinanceView({ kind, getToken }: { kind: FinanceKind; getToken: () => Promise<string | null> }) {
	const income = kind === 'income'; const areaRef = useRef<HTMLDivElement>(null);
	const [searchInput, setSearchInput] = useState(''); const [search, setSearch] = useState(''); const [filters, setFilters] = useState<FinanceFilters>(emptyFilters);
	const [listing, setListing] = useState<Listing>({ entries: [], total: 0, page: 1, pageSize: 10, summary: emptySummary }); const [categories, setCategories] = useState<Category[]>([]);
	const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(0); const [refresh, setRefresh] = useState(0);
	const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false); const [dialogError, setDialogError] = useState(''); const [dialog, setDialog] = useState<Dialog | null>(null);
	const request: FinanceRequest = useCallback(async <T,>(path: string, init?: RequestInit) => apiFetch<T>(`/v1/finance${path}`, await getToken(), init), [getToken]);
	const clients: ClientRequest = useCallback(async <T,>(path: string, init?: RequestInit) => apiFetch<T>(`/v1/clients${path}`, await getToken(), init), [getToken]);
	useEffect(() => { const timer = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 250); return () => clearTimeout(timer); }, [searchInput]);
	useEffect(() => {
		if (!areaRef.current) return;
		const observer = new ResizeObserver(([entry]) => setPageSize(Math.min(50, Math.max(1, Math.floor((entry.contentRect.height - 60) / 64)))));
		observer.observe(areaRef.current); return () => observer.disconnect();
	}, []);
	useEffect(() => {
		if (!pageSize) return; const controller = new AbortController();
		async function load() {
			setLoading(true); setError('');
			try {
				const query = new URLSearchParams({ ...filters, kind, search, page: String(page), pageSize: String(pageSize) }); query.delete('clientName');
				const [result, categoryResult] = await Promise.all([request<Listing>(`/entries?${query}`, { signal: controller.signal }), request<{ categories: Category[] }>(`/categories?kind=${kind}`, { signal: controller.signal })]);
				if (controller.signal.aborted) return;
				setCategories(categoryResult.categories);
				const maxPage = Math.max(1, Math.ceil(result.total / result.pageSize)); if (page > maxPage) { setPage(maxPage); return; }
				setListing(result);
			} catch (cause) { if (!controller.signal.aborted) setError(errorMessage(cause)); }
			finally { if (!controller.signal.aborted) setLoading(false); }
		}
		void load(); return () => controller.abort();
	}, [kind, filters, search, page, pageSize, refresh, request]);
	function changed() { setRefresh((value) => value + 1); }
	function open(value: Dialog) { setNotice(''); setDialogError(''); setDialog(value); }
	function saved() { setDialog(null); setNotice(dialog?.kind === 'editSeries' ? 'Recurrencia actualizada. Los movimientos existentes conservan sus datos.' : `${income ? 'Ingreso' : 'Gasto'} guardado.`); changed(); }
	async function remove() {
		if (dialog?.kind !== 'delete' || busy) return; setBusy(true); setDialogError('');
		try { await request(`/entries/${dialog.entry.id}?version=${dialog.entry.version}`, { method: 'DELETE' }); setDialog(null); setNotice('Movimiento eliminado.'); changed(); }
		catch (cause) { setDialogError(errorMessage(cause)); } finally { setBusy(false); }
	}
	const filterCount = Object.entries(filters).filter(([key, value]) => key !== 'clientName' && value).length;
	const summary = listing.summary;
	return <div className="flex min-h-0 flex-1 flex-col">
		<div className="mb-4 flex shrink-0 items-center justify-between gap-3"><h1 className="text-2xl font-semibold tracking-tight">{income ? 'Ingresos' : 'Gastos'}</h1><button type="button" onClick={() => open({ kind: 'create' })} className={primaryButton}><Plus className="size-4" />Nuevo {income ? 'ingreso' : 'gasto'}</button></div>
		{notice && <div role="status" className="fixed top-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0" /><span>{notice}</span><button type="button" aria-label="Cerrar aviso" onClick={() => setNotice('')}><X className="size-4" /></button></div>}
		<div aria-label="Resumen financiero" aria-busy={loading} className={`mb-2 grid shrink-0 grid-cols-3 gap-2 sm:gap-4 ${loading ? 'opacity-60' : ''}`}>
			{[{ label: 'Cobrado', value: summary.received, detail: `Pendiente: ${money(summary.pendingIncome)}`, style: 'text-emerald-700' }, { label: 'Pagado', value: summary.paid, detail: `Pendiente: ${money(summary.pendingExpense)}`, style: 'text-brand-900' }, { label: 'Saldo', value: summary.balance, detail: 'Cobrado − pagado', style: summary.balance < 0 ? 'text-red-600' : 'text-brand-900' }].map((item) => <div key={item.label} className="min-w-0 rounded-xl border border-ink-200 bg-white p-3 sm:p-4"><p className="text-xs text-ink-500">{item.label}</p><p className={`mt-1 break-words text-base font-semibold tracking-tight tabular-nums sm:text-2xl ${item.style}`}>{error ? '—' : money(item.value)}</p><p className="mt-1 break-words text-[10px] leading-4 text-ink-500 sm:text-xs">{error ? 'Sin datos actualizados' : item.detail}</p></div>)}
		</div>
		<p className="mb-4 shrink-0 text-[11px] leading-4 text-ink-500">Resumen de ambos tipos según los filtros y la fecha prevista. {filters.from || filters.to ? `${filters.from ? displayDate(filters.from) : 'Inicio'} — ${filters.to ? displayDate(filters.to) : 'Sin límite'}.` : 'Todos los períodos.'}</p>
		<div className="mb-4 flex shrink-0 flex-wrap items-center gap-2">
			<label className="relative min-w-0 flex-1"><span className="sr-only">Buscar movimientos</span><Search className="pointer-events-none absolute top-3 left-3 size-4 text-ink-400" /><input type="search" maxLength={200} placeholder="Buscar concepto, cliente o categoría…" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className={`${fieldClass} pl-9`} /></label>
			<button type="button" title="Filtrar movimientos" onClick={() => open({ kind: 'filters' })} className={secondaryButton}><Filter className="size-4" /><span className="hidden sm:inline">Filtros</span>{filterCount > 0 && <span className="rounded-full bg-brand-100 px-1.5 text-xs">{filterCount}</span>}</button>
			<button type="button" title="Recurrentes" onClick={() => open({ kind: 'series' })} className={secondaryButton}><Repeat2 className="size-4" /><span className="hidden md:inline">Recurrentes</span></button>
			<button type="button" title="Categorías" onClick={() => open({ kind: 'categories' })} className={secondaryButton}><Tags className="size-4" /><span className="hidden xl:inline">Categorías</span></button>
			<button type="button" title="Actualizar movimientos" aria-label="Actualizar movimientos" onClick={changed} className="rounded-lg border border-ink-200 bg-white p-3 text-ink-500 hover:bg-brand-100"><RefreshCw className="size-4" /></button>
			{filterCount > 0 && <button type="button" aria-label="Limpiar filtros" title="Limpiar filtros" onClick={() => { setFilters(emptyFilters); setPage(1); }} className="rounded-lg p-2 text-ink-500 hover:bg-brand-100"><X className="size-4" /></button>}
		</div>
		<section aria-label={`Lista de ${income ? 'ingresos' : 'gastos'}`} aria-busy={loading} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white p-4 sm:p-6">
			<div ref={areaRef} className="min-h-0 flex-1 overflow-x-auto">
				{error ? <div role="alert" className="rounded-xl bg-red-50 p-5 text-sm text-red-700"><p>{error}</p><button type="button" onClick={changed} className="mt-3 underline">Volver a intentar</button></div> : loading ? <div role="status" className="flex h-full items-center justify-center gap-2 text-sm text-ink-500"><LoaderCircle className="size-5 animate-spin" />Cargando movimientos…</div> : !listing.entries.length ? <div className="flex h-full flex-col items-center justify-center gap-3 text-center"><Receipt className="size-9 text-brand-600" /><h2 className="font-semibold">{search || filterCount ? 'No hay movimientos con esos filtros' : `Todavía no hay ${income ? 'ingresos' : 'gastos'}`}</h2><p className="max-w-md text-sm text-ink-500">{search || filterCount ? 'Prueba otra búsqueda o cambia los filtros.' : 'Registra un movimiento puntual o programa uno recurrente.'}</p>{!search && !filterCount && <button type="button" onClick={() => open({ kind: 'create' })} className={secondaryButton}>Crear primer {income ? 'ingreso' : 'gasto'}</button>}</div> : <table className="w-full min-w-[1000px] table-fixed text-left text-sm">
					<caption className="sr-only">Movimientos de {income ? 'ingresos' : 'gastos'} en euros</caption>
					<thead><tr className="h-11 border-b border-ink-200 text-xs text-ink-500"><th scope="col" className="w-[25%] pr-4 font-medium">Concepto / Cliente</th><th scope="col" className="w-[15%] pr-4 font-medium">Categoría</th><th scope="col" className="w-28 pr-4 font-medium">Fecha prevista</th><th scope="col" className="w-32 pr-4 font-medium">Importe</th><th scope="col" className="w-36 pr-4 font-medium">Estado</th><th scope="col" className="pr-4 font-medium">Periodicidad</th><th scope="col" className="w-28 text-right font-medium">Acciones</th></tr></thead>
					<tbody>{listing.entries.map((item) => <tr key={item.id} className="h-16 border-b border-ink-100 last:border-b-0"><td className="pr-4"><button type="button" title={item.concept} onClick={() => open({ kind: 'edit', entry: item })} className="block max-w-full truncate text-left font-medium hover:text-brand-600">{item.concept}</button><p className="mt-1 truncate text-xs text-ink-500">{item.clientName ?? 'Sin cliente'}</p></td><td className="truncate pr-4 text-ink-600" title={item.categoryName ?? undefined}>{item.categoryName ?? 'Sin categoría'}</td><td className="pr-4 text-xs text-ink-600">{displayDate(item.dueOn)}</td><td className={`whitespace-nowrap pr-4 font-medium tabular-nums ${income && item.status === 'settled' ? 'text-emerald-700' : ''}`}>{money(item.amountCents)}</td><td className="pr-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${item.status === 'settled' ? 'bg-emerald-50 text-emerald-700' : item.dueOn < currentDate() ? 'bg-amber-50 text-amber-800' : 'bg-brand-50 text-ink-600'}`}>{item.status === 'settled' ? income ? 'Cobrado' : 'Pagado' : 'Pendiente'}</span>{item.paidOn && <p className="mt-1 text-[11px] text-ink-400">{displayDate(item.paidOn)}</p>}</td><td className="pr-4 text-xs text-ink-500"><span className="inline-flex items-center gap-1.5">{item.seriesId && <Repeat2 className="size-3.5" />}{frequencyLabel(item.frequency)}</span></td><td><div className="flex justify-end gap-0.5">{item.attachment && <a href={item.attachment.url} title={`Descargar ${item.attachment.name}`} aria-label={`Descargar justificante de ${item.concept}`} className="rounded-lg p-2 text-ink-500 hover:bg-brand-50 hover:text-brand-600"><Paperclip className="size-4" /></a>}<button type="button" aria-label={`Editar ${item.concept}`} title="Editar movimiento" onClick={() => open({ kind: 'edit', entry: item })} className="rounded-lg p-2 text-ink-500 hover:bg-brand-50 hover:text-brand-600"><Pencil className="size-4" /></button><button type="button" aria-label={`Eliminar ${item.concept}`} title="Eliminar movimiento" onClick={() => open({ kind: 'delete', entry: item })} className="rounded-lg p-2 text-ink-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="size-4" /></button></div></td></tr>)}</tbody>
				</table>}
			</div>
			<div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-ink-200 pt-4 text-xs text-ink-500"><p>{listing.total ? (page - 1) * listing.pageSize + 1 : 0}–{Math.min(page * listing.pageSize, listing.total)} de {listing.total} movimientos</p><div className="flex items-center gap-3"><button type="button" aria-label="Página anterior" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-ink-200 p-2 disabled:opacity-30"><ChevronLeft className="size-4" /></button><span>{page} / {Math.max(1, Math.ceil(listing.total / listing.pageSize))}</span><button type="button" aria-label="Página siguiente" disabled={loading || page * listing.pageSize >= listing.total} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-ink-200 p-2 disabled:opacity-30"><ChevronRight className="size-4" /></button></div></div>
		</section>
		{dialog?.kind === 'create' || dialog?.kind === 'edit' || dialog?.kind === 'editSeries' ? <FinanceForm kind={kind} entry={dialog.kind === 'edit' ? dialog.entry : undefined} series={dialog.kind === 'editSeries' ? dialog.series : undefined} categories={categories} request={request} clients={clients} onSaved={saved} onClose={() => setDialog(null)} /> : dialog?.kind === 'filters' ? <FilterDialog filters={filters} categories={categories} kind={kind} clients={clients} onApply={(value) => { setFilters(value); setPage(1); setDialog(null); }} onClose={() => setDialog(null)} /> : dialog?.kind === 'categories' ? <CategoriesDialog kind={kind} categories={categories} request={request} onChanged={changed} onClose={() => setDialog(null)} /> : dialog?.kind === 'series' ? <SeriesDialog kind={kind} request={request} onEdit={(value) => open({ kind: 'editSeries', series: value })} onChanged={changed} onClose={() => setDialog(null)} /> : dialog?.kind === 'delete' && <Modal title="Eliminar movimiento" busy={busy} onClose={() => setDialog(null)}><div className="space-y-4 p-6"><p className="text-sm leading-6 text-ink-600">Se eliminará «{dialog.entry.concept}» ({money(dialog.entry.amountCents)}) y su justificante. Esta acción no se puede deshacer.</p>{dialog.entry.seriesId && <p className="rounded-lg bg-brand-50 p-3 text-sm leading-6 text-ink-600">Se elimina solo este vencimiento. La recurrencia seguirá generando los siguientes; puedes cancelarla desde Recurrentes.</p>}{dialogError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{dialogError}</p>}<div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setDialog(null)} className={secondaryButton}>Cancelar</button><button type="button" disabled={busy} onClick={() => void remove()} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">{busy && <LoaderCircle className="size-4 animate-spin" />}Eliminar movimiento</button></div></div></Modal>}
	</div>;
}
