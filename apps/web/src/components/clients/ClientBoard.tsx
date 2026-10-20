import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, pointerWithin, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Building, LoaderCircle, Mail, Pencil, Phone, Plus } from 'lucide-react';
import { useEffect, useState, type HTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { CLIENT_STAGES, stageDetails, type Client, type ClientBoardData, type ClientColumn, type ClientListing, type ClientRequest, type ClientStage } from '../../lib/clients';
import { errorMessage, secondaryButton } from '../../lib/gallery';
import ClientLogo from './ClientLogo';

function ClientDetails({ client }: { client: Client }) {
	return <><div className="flex items-center gap-2.5 pr-6"><ClientLogo client={client} /><h3 className="min-w-0 font-medium leading-5"><span data-no-drag className="cursor-text">{client.name}</span></h3></div>{client.company && <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-600"><Building className="size-3.5 shrink-0" /><span data-no-drag className="cursor-text truncate">{client.company}</span></p>}{client.email && <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-500"><Mail className="size-3.5 shrink-0" /><span data-no-drag className="cursor-text truncate">{client.email}</span></p>}{client.phone && <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-500"><Phone className="size-3.5 shrink-0" /><span data-no-drag className="cursor-text">{client.phone}</span></p>}{client.notes && <p className="mt-3 line-clamp-2 whitespace-pre-line text-xs leading-5 text-ink-500"><span data-no-drag className="cursor-text">{client.notes}</span></p>}</>;
}
function BoardCard({ client, pending, onEdit, onMove }: { client: Client; pending: boolean; onEdit: (client: Client) => void; onMove: (client: Client, stage: ClientStage) => void }) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: client.id, data: { stage: client.stage }, disabled: pending, attributes: { role: 'group', roleDescription: 'ficha de cliente arrastrable' } });
	const activation: HTMLAttributes<HTMLElement> = listeners ?? {};
	function canDrag(target: EventTarget | null) { return target instanceof Element && !target.closest('[data-no-drag], button, a, input, select, textarea, label, [contenteditable="true"]'); }
	return <article ref={setNodeRef} {...attributes} aria-label={`Mover ${client.name}`} data-client-id={client.id} onMouseDown={(event) => { if (canDrag(event.target)) activation.onMouseDown?.(event); }} onTouchStart={(event) => { if (canDrag(event.target)) activation.onTouchStart?.(event); }} onKeyDown={(event) => { if (event.target === event.currentTarget) activation.onKeyDown?.(event); }} style={{ transform: CSS.Transform.toString(transform), transition }} className={`relative touch-manipulation rounded-xl border border-ink-200 bg-white p-3.5 text-sm shadow-sm ${pending ? '' : 'cursor-grab active:cursor-grabbing'} ${isDragging ? 'opacity-35' : ''}`}>
		<ClientDetails client={client} />
		<button type="button" aria-label={`Editar ${client.name}`} title="Abrir ficha" disabled={pending} onClick={() => onEdit(client)} className="absolute top-2 right-2 cursor-pointer rounded-md p-1.5 text-ink-400 hover:bg-brand-50 hover:text-brand-600"><Pencil className="size-3.5" /></button>
		<label className="mt-3 block cursor-default border-t border-ink-100 pt-2"><span className="sr-only">Fase de {client.name}</span><select disabled={pending} value={client.stage} onChange={(event) => onMove(client, event.target.value as ClientStage)} className="w-full min-w-0 cursor-pointer rounded-md bg-white py-1 text-xs text-ink-500 outline-offset-2 disabled:opacity-50">{CLIENT_STAGES.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label>
	</article>;
}
function Column({ column, pending, loadingMore, onMore, onEdit, onCreate, onMove }: {
	column: ClientColumn; pending: boolean; loadingMore: boolean; onMore: () => void; onEdit: (client: Client) => void; onCreate: () => void; onMove: (client: Client, stage: ClientStage) => void;
}) {
	const phase = stageDetails(column.stage); const { setNodeRef, isOver } = useDroppable({ id: column.stage, data: { stage: column.stage }, disabled: pending });
	return <section ref={setNodeRef} data-stage={column.stage} aria-label={phase.label} className={`flex h-full w-72 shrink-0 flex-col rounded-xl border p-3 ${isOver ? 'border-brand-400 bg-brand-100' : 'border-ink-200 bg-ink-50/80'}`}>
		<div className="mb-3 flex shrink-0 items-center gap-2 px-1"><span className={`size-2 shrink-0 rounded-full ${phase.dot}`} /><h2 className="min-w-0 flex-1 text-sm font-semibold">{phase.label}</h2><span className="text-xs tabular-nums text-ink-400">{column.total}</span><button type="button" disabled={pending} aria-label={`Nuevo cliente en ${phase.label}`} onClick={onCreate} className="rounded-md p-1 text-ink-500 hover:bg-white"><Plus className="size-4" /></button></div>
		<div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-0.5 pb-1">
			<SortableContext items={column.clients.map((client) => client.id)} strategy={verticalListSortingStrategy}>{column.clients.map((client) => <BoardCard key={client.id} client={client} pending={pending} onEdit={onEdit} onMove={onMove} />)}</SortableContext>
			{!column.total && <p className="rounded-xl border border-dashed border-ink-200 px-3 py-8 text-center text-xs leading-5 text-ink-400">Arrastra un cliente aquí<br />o añade uno nuevo.</p>}
			{column.clients.length < column.total && <button type="button" disabled={pending || loadingMore} onClick={onMore} className={`${secondaryButton} w-full`}>{loadingMore && <LoaderCircle className="size-4 animate-spin" />}Cargar más ({column.total - column.clients.length})</button>}
		</div>
	</section>;
}

export default function ClientBoard({ request, search, refresh, onEdit, onCreate }: {
	request: ClientRequest; search: string; refresh: number; onEdit: (client: Client) => void; onCreate: (stage: ClientStage) => void;
}) {
	const [columns, setColumns] = useState<ClientColumn[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
	const [pending, setPending] = useState(false); const [busyStage, setBusyStage] = useState(''); const [active, setActive] = useState<Client | null>(null); const [retry, setRetry] = useState(0);
	const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
	useEffect(() => {
		const controller = new AbortController();
		async function load() {
			setLoading(true); setError('');
			try { const result = await request<ClientBoardData>(`/board?${new URLSearchParams({ search })}`, { signal: controller.signal }); if (!controller.signal.aborted) setColumns(result.columns); }
			catch (cause) { if (!controller.signal.aborted) setError(errorMessage(cause)); }
			finally { if (!controller.signal.aborted) setLoading(false); }
		}
		void load();
		return () => controller.abort();
	}, [request, search, refresh, retry]);
	async function reloadColumns(stages: ClientStage[], snapshot: ClientColumn[]) {
		const result = await Promise.all(stages.map(async (stage) => {
			const previous = snapshot.find((column) => column.stage === stage);
			const pages = Math.max(1, Math.ceil((previous?.clients.length ?? 0) / 20));
			const listings = await Promise.all(Array.from({ length: pages }, (_, index) => request<ClientListing>(`?${new URLSearchParams({ stage, search, order: 'position', page: String(index + 1), pageSize: '20' })}`)));
			return { ...listings[0], stage, clients: listings.flatMap((listing) => listing.clients) };
		}));
		setColumns((previous) => previous.map((column) => result.find((item) => item.stage === column.stage) ?? column));
	}
	async function move(client: Client, stage: ClientStage, beforeId: string | null = null) {
		if (pending || busyStage || beforeId === client.id) return;
		const snapshot = columns; setPending(true); setError('');
		setColumns((previous) => previous.map((column) => {
			const clients = column.clients.filter((item) => item.id !== client.id);
			if (column.stage === stage) { const index = beforeId ? clients.findIndex((item) => item.id === beforeId) : clients.length; clients.splice(Math.max(0, index), 0, { ...client, stage }); }
			return { ...column, clients, total: column.total + (column.stage === stage ? 1 : 0) - (column.stage === client.stage ? 1 : 0) };
		}));
		try {
			await request(`/${client.id}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage, beforeId, version: client.version }) });
			await reloadColumns([...new Set([client.stage, stage])], snapshot);
		} catch (cause) {
			setColumns(snapshot); setError(errorMessage(cause));
			try { const result = await request<ClientBoardData>(`/board?${new URLSearchParams({ search })}`); setColumns(result.columns); } catch { /* Keep the last confirmed board and allow retry. */ }
		} finally { setPending(false); }
	}
	async function loadMore(column: ClientColumn) {
		if (pending || busyStage) return;
		setBusyStage(column.stage); setError('');
		try {
			const nextPage = Math.floor(column.clients.length / 20) + 1;
			const listing = await request<ClientListing>(`?${new URLSearchParams({ stage: column.stage, search, order: 'position', page: String(nextPage), pageSize: '20' })}`);
			setColumns((previous) => previous.map((item) => item.stage === column.stage ? { ...item, total: listing.total, clients: [...new Map([...item.clients, ...listing.clients].map((client) => [client.id, client])).values()] } : item));
		} catch (cause) { setError(errorMessage(cause)); }
		finally { setBusyStage(''); }
	}
	const collision: CollisionDetection = (args) => {
		const hits = pointerWithin(args);
		const cards = hits.filter((hit) => !CLIENT_STAGES.some((stage) => stage.id === hit.id));
		return cards.length ? cards : hits.length ? hits : closestCenter(args);
	};
	function dragEnd(event: DragEndEvent) {
		setActive(null);
		const { active: dragged, over } = event; if (!over || pending || busyStage) return;
		const client = columns.flatMap((column) => column.clients).find((item) => item.id === dragged.id); if (!client || dragged.id === over.id) return;
		const target = columns.find((column) => column.stage === over.id || column.clients.some((item) => item.id === over.id)); if (!target) return;
		const other = target.clients.filter((item) => item.id !== client.id);
		let beforeId: string | null = null;
		const index = other.findIndex((item) => item.id === over.id);
		if (index >= 0) {
			const rect = dragged.rect.current.translated;
			const after = rect ? rect.top + rect.height / 2 > over.rect.top + over.rect.height / 2 : false;
			beforeId = other[index + (after ? 1 : 0)]?.id ?? null;
		}
		void move(client, target.stage, beforeId);
	}
	return <div className="flex min-h-0 flex-1 flex-col" aria-busy={pending || loading}>
		{error && <div role="alert" className="mb-3 shrink-0 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}<button type="button" disabled={pending} onClick={() => setRetry((value) => value + 1)} className="ml-3 underline">Actualizar tablero</button></div>}
		{loading ? <div role="status" className="flex flex-1 items-center justify-center gap-2 text-sm text-ink-500"><LoaderCircle className="size-5 animate-spin" />Cargando tablero…</div> : <DndContext sensors={sensors} collisionDetection={collision} onDragStart={({ active: dragged }) => setActive(columns.flatMap((column) => column.clients).find((client) => client.id === dragged.id) ?? null)} onDragCancel={() => setActive(null)} onDragEnd={dragEnd} accessibility={{ screenReaderInstructions: { draggable: 'Pulsa espacio para coger la ficha, usa las flechas para moverla y pulsa espacio para soltarla. Pulsa escape para cancelar.' }, announcements: { onDragStart: () => 'Ficha seleccionada. Usa las flechas para moverla.', onDragOver: ({ over }) => over ? `Sobre ${stageDetails(columns.find((column) => column.stage === over.id || column.clients.some((client) => client.id === over.id))?.stage ?? 'uncontacted').label}.` : 'Fuera del tablero.', onDragEnd: ({ over }) => over ? 'Ficha soltada. Guardando posición.' : 'Movimiento cancelado.', onDragCancel: () => 'Movimiento cancelado.' } }}>
			<div role="region" aria-label="Fases de los clientes" className="flex min-h-0 flex-1 gap-4 overflow-x-auto overscroll-x-contain pb-3">{columns.map((column) => <Column key={column.stage} column={column} pending={pending || !!busyStage} loadingMore={busyStage === column.stage} onMore={() => void loadMore(column)} onEdit={onEdit} onCreate={() => onCreate(column.stage)} onMove={(client, stage) => { if (client.stage !== stage) void move(client, stage); }} />)}</div>
			{createPortal(<DragOverlay>{active && <div className="w-[260px] rounded-xl border border-brand-300 bg-white p-3.5 text-sm shadow-xl"><ClientDetails client={active} /></div>}</DragOverlay>, document.body)}
		</DndContext>}
		{pending && <p role="status" className="sr-only">Guardando fase y posición del cliente…</p>}
	</div>;
}
