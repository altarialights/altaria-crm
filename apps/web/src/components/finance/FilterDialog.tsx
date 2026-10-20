import { useState } from 'react';
import type { ClientRequest } from '../../lib/clients';
import { emptyFilters, type Category, type FinanceFilters, type FinanceKind } from '../../lib/finance';
import { fieldClass, primaryButton, secondaryButton } from '../../lib/gallery';
import ClientPicker from '../clients/ClientPicker';
import Modal from '../gallery/Modal';

export default function FilterDialog({ filters, categories, kind, clients, onApply, onClose }: {
	filters: FinanceFilters; categories: Category[]; kind: FinanceKind; clients: ClientRequest; onApply: (filters: FinanceFilters) => void; onClose: () => void;
}) {
	const [values, setValues] = useState(filters);
	function field(name: keyof FinanceFilters, value: string) { setValues((previous) => ({ ...previous, [name]: value })); }
	return <Modal title="Filtrar movimientos" onClose={onClose} wide>
		<form className="space-y-5 p-6" onSubmit={(event) => { event.preventDefault(); onApply(values); }}>
			<div className="grid gap-5 sm:grid-cols-2">
				<label className="space-y-2 text-sm font-medium"><span className="block">Fecha prevista desde</span><input type="date" name="from" min="2000-01-01" max={values.to || '2099-12-31'} value={values.from} onChange={(event) => field('from', event.target.value)} className={fieldClass} /></label>
				<label className="space-y-2 text-sm font-medium"><span className="block">Fecha prevista hasta</span><input type="date" name="to" min={values.from || '2000-01-01'} max="2099-12-31" value={values.to} onChange={(event) => field('to', event.target.value)} className={fieldClass} /></label>
				<label className="space-y-2 text-sm font-medium"><span className="block">Categoría</span><select name="categoryId" value={values.categoryId} onChange={(event) => field('categoryId', event.target.value)} className={fieldClass}><option value="">Todas las categorías</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
				<label className="space-y-2 text-sm font-medium"><span className="block">Estado</span><select name="status" value={values.status} onChange={(event) => field('status', event.target.value)} className={fieldClass}><option value="">Todos los estados</option><option value="pending">Pendiente</option><option value="settled">{kind === 'income' ? 'Cobrado' : 'Pagado'}</option></select></label>
				<label className="space-y-2 text-sm font-medium"><span className="block">Periodicidad</span><select name="recurrence" value={values.recurrence} onChange={(event) => field('recurrence', event.target.value)} className={fieldClass}><option value="">Puntuales y recurrentes</option><option value="once">Puntual</option><option value="recurring">Recurrente</option></select></label>
			</div>
			<div className="space-y-2"><p className="text-sm font-medium">Cliente</p><ClientPicker selected={values.clientId ? { id: values.clientId, name: values.clientName } : null} onChange={(client) => setValues((previous) => ({ ...previous, clientId: client?.id ?? '', clientName: client?.name ?? '' }))} request={clients} /></div>
			<div className="flex flex-wrap justify-between gap-3"><button type="button" onClick={() => setValues(emptyFilters)} className={secondaryButton}>Limpiar filtros</button><div className="flex gap-2"><button type="button" onClick={onClose} className={secondaryButton}>Cancelar</button><button type="submit" className={primaryButton}>Aplicar filtros</button></div></div>
		</form>
	</Modal>;
}
