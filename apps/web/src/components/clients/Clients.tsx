import { useAuth } from '@clerk/astro/react';
import { CheckCircle2, Columns3, List, LoaderCircle, Plus, RefreshCw, Search, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { CLIENT_STAGES, type Client, type ClientRequest, type ClientStage } from '../../lib/clients';
import { errorMessage, fieldClass, primaryButton, secondaryButton } from '../../lib/gallery';
import Modal from '../gallery/Modal';
import ClientBoard from './ClientBoard';
import ClientForm from './ClientForm';
import ClientList from './ClientList';

type Dialog = { kind: 'create'; stage: ClientStage } | { kind: 'edit' | 'delete'; client: Client };
export default function Clients({ view, initialStage = '' }: { view: 'list' | 'board'; initialStage?: string }) {
	const { isLoaded, isSignedIn, getToken } = useAuth();
	if (!isLoaded) return <p role="status" className="text-sm text-ink-500">Cargando clientes…</p>;
	if (!isSignedIn) return <p className="text-sm text-ink-600">Vuelve a iniciar sesión para gestionar tus clientes.</p>;
	return <ClientsView view={view} initialStage={initialStage} getToken={getToken} />;
}
export function ClientsView({ view, initialStage = '', getToken }: { view: 'list' | 'board'; initialStage?: string; getToken: () => Promise<string | null> }) {
	const [searchInput, setSearchInput] = useState(''); const [search, setSearch] = useState('');
	const [stage, setStage] = useState(CLIENT_STAGES.some((item) => item.id === initialStage) ? initialStage : '');
	const [refresh, setRefresh] = useState(0); const [dialog, setDialog] = useState<Dialog | null>(null);
	const [notice, setNotice] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
	const request: ClientRequest = useCallback(async <T,>(path: string, init?: RequestInit) => apiFetch<T>(`/v1/clients${path}`, await getToken(), init), [getToken]);
	useEffect(() => { const timer = setTimeout(() => setSearch(searchInput.trim()), 250); return () => clearTimeout(timer); }, [searchInput]);
	function open(value: Dialog) { setNotice(''); setError(''); setDialog(value); }
	function saved(client: Client) { setDialog(null); setNotice(`Cliente «${client.name}» guardado.`); setRefresh((value) => value + 1); }
	async function remove() {
		if (dialog?.kind !== 'delete' || busy) return;
		setBusy(true); setError('');
		try { await request(`/${dialog.client.id}?version=${dialog.client.version}`, { method: 'DELETE' }); setDialog(null); setNotice('Cliente eliminado.'); setRefresh((value) => value + 1); }
		catch (cause) { setError(errorMessage(cause)); }
		finally { setBusy(false); }
	}
	return <div className="flex min-h-0 flex-1 flex-col">
		<div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3 sm:mb-6"><h1 className="text-2xl font-semibold tracking-tight">{view === 'board' ? 'Fases de clientes' : 'Clientes'}</h1><div className="flex gap-2"><a href={view === 'board' ? '/clientes/lista' : '/clientes/fases'} className={secondaryButton}>{view === 'board' ? <List className="size-4" /> : <Columns3 className="size-4" />}<span className="hidden sm:inline">{view === 'board' ? 'Ver lista' : 'Ver fases'}</span></a><button type="button" onClick={() => open({ kind: 'create', stage: (stage || 'uncontacted') as ClientStage })} className={primaryButton}><Plus className="size-4" />Nuevo cliente</button></div></div>
		{notice && <div role="status" className="fixed top-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0" /><span>{notice}</span><button type="button" aria-label="Cerrar aviso" onClick={() => setNotice('')}><X className="size-4" /></button></div>}
		<div className="mb-4 flex shrink-0 flex-wrap items-center gap-3"><label className="relative min-w-0 flex-1 sm:max-w-sm"><span className="sr-only">Buscar clientes</span><Search className="pointer-events-none absolute top-3 left-3 size-4 text-ink-400" /><input type="search" maxLength={200} placeholder="Buscar nombre, empresa o contacto…" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className={`${fieldClass} pl-9`} /></label>{view === 'list' && <label><span className="sr-only">Filtrar por fase</span><select value={stage} onChange={(event) => setStage(event.target.value)} className={fieldClass}><option value="">Todas las fases</option>{CLIENT_STAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}<button type="button" title="Actualizar clientes" aria-label="Actualizar clientes" onClick={() => setRefresh((value) => value + 1)} className="rounded-lg border border-ink-200 bg-white p-3 text-ink-500 hover:bg-brand-100"><RefreshCw className="size-4" /></button></div>
		{view === 'board' ? <ClientBoard key={search} request={request} search={search} refresh={refresh} onEdit={(client) => open({ kind: 'edit', client })} onCreate={(phase) => open({ kind: 'create', stage: phase })} /> : <ClientList key={`${search}:${stage}`} request={request} search={search} stage={stage} refresh={refresh} onEdit={(client) => open({ kind: 'edit', client })} onDelete={(client) => open({ kind: 'delete', client })} onCreate={() => open({ kind: 'create', stage: 'uncontacted' })} />}
		{dialog?.kind === 'create' || dialog?.kind === 'edit' ? <ClientForm client={dialog.kind === 'edit' ? dialog.client : undefined} stage={dialog.kind === 'create' ? dialog.stage : undefined} request={request} onSaved={saved} onClose={() => setDialog(null)} /> : dialog?.kind === 'delete' && <Modal title="Eliminar cliente" busy={busy} onClose={() => setDialog(null)}><div className="p-6"><p className="text-sm leading-6 text-ink-600">Se eliminará la ficha de <strong>{dialog.client.name}</strong>. Esta acción no se puede deshacer.</p>{error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="mt-6 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setDialog(null)} className={secondaryButton}>Cancelar</button><button type="button" disabled={busy} onClick={() => void remove()} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">{busy && <LoaderCircle className="size-4 animate-spin" />}Eliminar cliente</button></div></div></Modal>}
	</div>;
}
