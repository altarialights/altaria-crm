import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { CLIENT_STAGES, type Client, type ClientRequest, type ClientStage } from '../../lib/clients';
import { errorMessage, fieldClass, primaryButton, secondaryButton } from '../../lib/gallery';
import Modal from '../gallery/Modal';

export default function ClientForm({ client, stage = 'uncontacted', request, onSaved, onClose }: {
	client?: Client; stage?: ClientStage; request: ClientRequest; onSaved: (client: Client) => void; onClose: () => void;
}) {
	const [fields, setFields] = useState({ name: client?.name ?? '', company: client?.company ?? '', email: client?.email ?? '', phone: client?.phone ?? '', website: client?.website ?? '', notes: client?.notes ?? '', stage: client?.stage ?? stage });
	const [busy, setBusy] = useState(false); const [error, setError] = useState('');
	function field(name: Exclude<keyof typeof fields, 'stage'>, value: string) { setFields((previous) => ({ ...previous, [name]: value })); }
	async function save() {
		if (busy) return;
		setBusy(true); setError('');
		try {
			const result = await request<Client>(client ? `/${client.id}` : '', { method: client ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...fields, ...(client ? { version: client.version } : {}) }) });
			onSaved(result);
		} catch (cause) { setError(errorMessage(cause)); }
		finally { setBusy(false); }
	}
	return <Modal title={client ? 'Ficha del cliente' : 'Nuevo cliente'} busy={busy} wide onClose={onClose}>
		<form className="p-6" onSubmit={(event) => { event.preventDefault(); void save(); }}>
			<fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
				<div className="grid gap-5 sm:grid-cols-2">
					<label className="space-y-2 text-sm font-medium"><span className="block">Nombre</span><input autoFocus name="name" required maxLength={200} placeholder="Nombre del cliente" value={fields.name} onChange={(event) => field('name', event.target.value)} className={fieldClass} /></label>
					<label className="space-y-2 text-sm font-medium"><span className="block">Empresa</span><input name="company" maxLength={200} placeholder="Empresa o negocio (opcional)" value={fields.company} onChange={(event) => field('company', event.target.value)} className={fieldClass} /></label>
					<label className="space-y-2 text-sm font-medium"><span className="block">Email</span><input name="email" type="email" maxLength={254} placeholder="nombre@ejemplo.com" value={fields.email} onChange={(event) => field('email', event.target.value)} className={fieldClass} /></label>
					<label className="space-y-2 text-sm font-medium"><span className="block">Teléfono</span><input name="phone" type="tel" maxLength={50} placeholder="Teléfono de contacto" value={fields.phone} onChange={(event) => field('phone', event.target.value)} className={fieldClass} /></label>
					<label className="space-y-2 text-sm font-medium"><span className="block">Web</span><input name="website" type="url" maxLength={2048} placeholder="https://ejemplo.com" value={fields.website} onChange={(event) => field('website', event.target.value)} className={fieldClass} /></label>
					<label className="space-y-2 text-sm font-medium"><span className="block">Fase</span><select name="stage" value={fields.stage} onChange={(event) => setFields((previous) => ({ ...previous, stage: event.target.value as ClientStage }))} className={fieldClass}>{CLIENT_STAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
				</div>
				<label className="block space-y-2 text-sm font-medium"><span className="block">Notas</span><textarea name="notes" rows={4} maxLength={5000} placeholder="Información del cliente, detalles del proyecto, próxima conversación…" value={fields.notes} onChange={(event) => field('notes', event.target.value)} className={`${fieldClass} resize-y`} /></label>
			</fieldset>
			{error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
			<div className="mt-6 flex justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className={secondaryButton}>Cancelar</button><button type="submit" disabled={busy || !fields.name.trim()} className={primaryButton}>{busy && <LoaderCircle className="size-4 animate-spin" />}{client ? 'Guardar cambios' : 'Crear cliente'}</button></div>
		</form>
	</Modal>;
}
