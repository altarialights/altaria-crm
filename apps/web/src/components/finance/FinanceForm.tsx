import { LoaderCircle, Paperclip, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import type { ClientRequest } from '../../lib/clients';
import { currentDate, FREQUENCIES, parseAmount, type Category, type Entry, type FinanceKind, type FinanceRequest, type Series } from '../../lib/finance';
import { errorMessage, fieldClass, primaryButton, secondaryButton } from '../../lib/gallery';
import ClientPicker from '../clients/ClientPicker';
import Modal from '../gallery/Modal';

export default function FinanceForm({ kind, entry, series, categories, request, clients, onSaved, onClose }: {
	kind: FinanceKind; entry?: Entry; series?: Series; categories: Category[]; request: FinanceRequest; clients: ClientRequest; onSaved: () => void; onClose: () => void;
}) {
	const initial = entry ?? series; const income = kind === 'income';
	const [fields, setFields] = useState(() => ({ concept: initial?.concept ?? '', amount: initial ? (initial.amountCents / 100).toFixed(2).replace('.', ',') : '', categoryId: initial?.categoryId ?? '', dueOn: entry?.dueOn ?? series?.startsOn ?? currentDate(), status: entry?.status ?? 'pending', paidOn: entry?.paidOn ?? currentDate(), notes: initial?.notes ?? '', frequency: series?.frequency ?? entry?.frequency ?? 'monthly', endsOn: series?.endsOn ?? '' }));
	const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(initial?.clientId ? { id: initial.clientId, name: initial.clientName ?? 'Cliente' } : null);
	const [recurring, setRecurring] = useState(!!series); const [file, setFile] = useState<File | null>(null); const [removeAttachment, setRemoveAttachment] = useState(false);
	const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const fileRef = useRef<HTMLInputElement>(null); const fileId = useId();
	function field(name: keyof typeof fields, value: string) { setFields((previous) => ({ ...previous, [name]: value })); }
	async function save() {
		if (busy) return; const amountCents = parseAmount(fields.amount);
		if (!amountCents) { setError('Introduce un importe positivo con un máximo de dos decimales.'); return; }
		setBusy(true); setError('');
		try {
			const data = { kind, concept: fields.concept, amountCents, categoryId: fields.categoryId || null, clientId: selectedClient?.id ?? null, notes: fields.notes, ...(series ? { version: series.version, frequency: fields.frequency, endsOn: fields.endsOn || null } : { dueOn: fields.dueOn, status: fields.status, paidOn: fields.status === 'settled' ? fields.paidOn : null, removeAttachment, ...(entry ? { version: entry.version } : recurring ? { recurrence: { frequency: fields.frequency, endsOn: fields.endsOn || null } } : {}) }) };
			const form = new FormData(); form.set('data', JSON.stringify(data)); if (file) form.set('attachment', file);
			await request(series ? `/series/${series.id}` : entry ? `/entries/${entry.id}` : '/entries', { method: initial ? 'PATCH' : 'POST', ...(file ? { body: form } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }) });
			onSaved();
		} catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
	}
	return <Modal title={series ? 'Editar recurrencia' : entry ? `Editar ${income ? 'ingreso' : 'gasto'}` : `Nuevo ${income ? 'ingreso' : 'gasto'}`} busy={busy} wide onClose={onClose}>
		<form className="space-y-5 p-6" onSubmit={(event) => { event.preventDefault(); void save(); }}>
			{(series || entry?.seriesId) && <p className="rounded-lg bg-brand-50 p-3 text-sm leading-6 text-ink-600">{series ? 'Los cambios se aplican a los siguientes vencimientos. Los movimientos ya creados conservan sus datos.' : 'Estás editando un único vencimiento. Puedes cambiar la programación desde Recurrentes.'}</p>}
			<fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
				<div className="grid gap-5 sm:grid-cols-2">
					<label className="space-y-2 text-sm font-medium sm:col-span-2"><span className="block">Concepto</span><input autoFocus name="concept" required maxLength={200} value={fields.concept} onChange={(event) => field('concept', event.target.value)} placeholder={income ? 'Diseño de tarjetas' : 'Materiales de impresión'} className={fieldClass} /></label>
					<label className="space-y-2 text-sm font-medium"><span className="block">Importe (€)</span><input name="amount" inputMode="decimal" required maxLength={11} value={fields.amount} onChange={(event) => field('amount', event.target.value)} placeholder="0,00" className={fieldClass} /></label>
					<label className="space-y-2 text-sm font-medium"><span className="block">Categoría</span><select name="categoryId" value={fields.categoryId} onChange={(event) => field('categoryId', event.target.value)} className={fieldClass}><option value="">Sin categoría</option>{categories.filter((category) => category.kind === kind).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
					{!series && <label className="space-y-2 text-sm font-medium"><span className="block">{recurring && !entry ? 'Primer vencimiento' : 'Fecha prevista'}</span><input name="dueOn" type="date" min="2000-01-01" max="2099-12-31" required value={fields.dueOn} onChange={(event) => field('dueOn', event.target.value)} className={fieldClass} /></label>}
					{!initial && <label className="space-y-2 text-sm font-medium"><span className="block">Periodicidad</span><select name="recurring" value={recurring ? 'recurring' : 'once'} onChange={(event) => setRecurring(event.target.value === 'recurring')} className={fieldClass}><option value="once">Puntual</option><option value="recurring">Recurrente</option></select></label>}
					{recurring && <><label className="space-y-2 text-sm font-medium"><span className="block">Frecuencia</span><select name="frequency" value={fields.frequency} onChange={(event) => field('frequency', event.target.value)} className={fieldClass}>{FREQUENCIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="space-y-2 text-sm font-medium"><span className="block">Fecha de fin (opcional)</span><input name="endsOn" type="date" min={series?.startsOn ?? fields.dueOn} max="2099-12-31" value={fields.endsOn} onChange={(event) => field('endsOn', event.target.value)} className={fieldClass} /></label></>}
					{!series && <><label className="space-y-2 text-sm font-medium"><span className="block">Estado</span><select name="status" value={fields.status} onChange={(event) => field('status', event.target.value)} className={fieldClass}><option value="pending">Pendiente</option><option value="settled">{income ? 'Cobrado' : 'Pagado'}</option></select></label>{fields.status === 'settled' && <label className="space-y-2 text-sm font-medium"><span className="block">Fecha de {income ? 'cobro' : 'pago'}</span><input name="paidOn" type="date" min="2000-01-01" max={currentDate()} required value={fields.paidOn} onChange={(event) => field('paidOn', event.target.value)} className={fieldClass} /></label>}</>}
				</div>
				{recurring && !series && <p className="text-xs leading-5 text-ink-500">Cada vencimiento tendrá su propio movimiento. Los siguientes se crearán como pendientes al llegar su fecha.</p>}
				<div className="space-y-2"><p className="text-sm font-medium">Cliente (opcional)</p><ClientPicker selected={selectedClient} onChange={setSelectedClient} request={clients} /></div>
				<label className="block space-y-2 text-sm font-medium"><span className="block">Notas</span><textarea name="notes" rows={3} maxLength={5000} value={fields.notes} onChange={(event) => field('notes', event.target.value)} placeholder="Detalles del movimiento…" className={`${fieldClass} resize-y`} /></label>
				{!series && <div className="space-y-2 rounded-xl border border-ink-200 p-4"><label htmlFor={fileId} className="block text-sm font-medium">Justificante (opcional)</label>{entry?.attachment && !removeAttachment && !file && <a href={entry.attachment.url} className="inline-flex max-w-full items-center gap-2 text-sm text-brand-600 hover:underline"><Paperclip className="size-4 shrink-0" /><span className="truncate">{entry.attachment.name}</span></a>}<input ref={fileRef} id={fileId} name="attachment" type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/gif,image/avif" className="block w-full text-xs text-ink-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-xs file:font-medium file:text-brand-700" onChange={(event) => { const selected = event.target.files?.[0]; if (!selected) return; if (!selected.size || selected.size > 10 * 1024 * 1024) { setError('El justificante debe ocupar entre 1 byte y 10 MB.'); event.target.value = ''; return; } setError(''); setFile(selected); setRemoveAttachment(false); }} /><p className="text-xs text-ink-400">PDF o imagen. Máximo 10 MB.{recurring ? ' Se adjunta solo a este movimiento.' : ''}</p>{(file || (entry?.attachment && !removeAttachment)) && <button type="button" onClick={() => { setFile(null); setRemoveAttachment(true); if (fileRef.current) fileRef.current.value = ''; }} className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-red-600"><X className="size-3.5" />Quitar justificante</button>}</div>}
			</fieldset>
			{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
			<div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className={secondaryButton}>Cancelar</button><button type="submit" disabled={busy || !fields.concept.trim()} className={primaryButton}>{busy && <LoaderCircle className="size-4 animate-spin" />}{initial ? 'Guardar cambios' : `Crear ${income ? 'ingreso' : 'gasto'}`}</button></div>
		</form>
	</Modal>;
}
