import { LoaderCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Category, FinanceKind, FinanceRequest } from '../../lib/finance';
import { errorMessage, fieldClass, primaryButton, secondaryButton } from '../../lib/gallery';
import Modal from '../gallery/Modal';

export default function CategoriesDialog({ categories, kind, request, onChanged, onClose }: { categories: Category[]; kind: FinanceKind; request: FinanceRequest; onChanged: () => void; onClose: () => void }) {
	const [items, setItems] = useState(categories); const [name, setName] = useState(''); const [editing, setEditing] = useState<Category | null>(null); const [removing, setRemoving] = useState<Category | null>(null);
	const [busy, setBusy] = useState(false); const [error, setError] = useState('');
	async function save() {
		if (busy || !name.trim()) return; setBusy(true); setError('');
		try {
			const result = await request<Category>(editing ? `/categories/${editing.id}` : '/categories', { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, kind, ...(editing ? { version: editing.version } : {}) }) });
			setItems((previous) => [...previous.filter((item) => item.id !== result.id), result].sort((a, b) => a.name.localeCompare(b.name, 'es'))); setName(''); setEditing(null); onChanged();
		} catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
	}
	async function remove() {
		if (!removing || busy) return; setBusy(true); setError('');
		try { await request(`/categories/${removing.id}?version=${removing.version}`, { method: 'DELETE' }); setItems((previous) => previous.filter((item) => item.id !== removing.id)); setRemoving(null); onChanged(); }
		catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
	}
	return <Modal title={`Categorías de ${kind === 'income' ? 'ingresos' : 'gastos'}`} busy={busy} onClose={onClose}>
		<div className="space-y-4 p-6">
			<form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); void save(); }}><label className="min-w-0 flex-1 space-y-2 text-sm font-medium"><span className="block">{editing ? 'Editar categoría' : 'Nueva categoría'}</span><input name="categoryName" required maxLength={100} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} className={fieldClass} placeholder="Nombre de la categoría" /></label><button type="submit" disabled={busy || !name.trim()} className={primaryButton}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}{editing ? 'Guardar' : 'Añadir'}</button></form>
			{editing && <button type="button" disabled={busy} onClick={() => { setEditing(null); setName(''); }} className="text-xs text-brand-600 underline">Cancelar edición</button>}
			<ul className="divide-y divide-ink-100">{items.map((item) => <li key={item.id} className="flex items-center gap-2 py-2"><span className="min-w-0 flex-1 truncate text-sm">{item.name}</span><button type="button" disabled={busy} aria-label={`Editar categoría ${item.name}`} onClick={() => { setEditing(item); setName(item.name); setRemoving(null); setError(''); }} className="rounded-lg p-2 text-ink-500 hover:bg-brand-50"><Pencil className="size-4" /></button><button type="button" disabled={busy} aria-label={`Eliminar categoría ${item.name}`} onClick={() => { setRemoving(item); setError(''); }} className="rounded-lg p-2 text-ink-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="size-4" /></button></li>)}</ul>
			{removing && <div className="rounded-lg border border-red-200 p-3 text-sm"><p>¿Eliminar la categoría «{removing.name}»?</p><div className="mt-3 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setRemoving(null)} className={secondaryButton}>Cancelar</button><button type="button" disabled={busy} onClick={() => void remove()} className={`${secondaryButton} text-red-600`}>Eliminar categoría</button></div></div>}
			{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
			<p className="text-xs leading-5 text-ink-500">Las categorías con movimientos o recurrencias asociados se conservan para mantener el historial.</p>
			<div className="flex justify-end"><button type="button" disabled={busy} onClick={onClose} className={secondaryButton}>Cerrar</button></div>
		</div>
	</Modal>;
}
