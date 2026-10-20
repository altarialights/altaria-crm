import { Building, LoaderCircle, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { CLIENT_STAGES, type Client, type ClientRequest, type ClientStage } from '../../lib/clients';
import { errorMessage, fieldClass, primaryButton, secondaryButton } from '../../lib/gallery';
import Modal from '../gallery/Modal';

export default function ClientForm({ client, stage = 'uncontacted', request, onSaved, onClose }: {
	client?: Client; stage?: ClientStage; request: ClientRequest; onSaved: (client: Client) => void; onClose: () => void;
}) {
	const [fields, setFields] = useState({ name: client?.name ?? '', company: client?.company ?? '', email: client?.email ?? '', phone: client?.phone ?? '', website: client?.website ?? '', notes: client?.notes ?? '', stage: client?.stage ?? stage });
	const [busy, setBusy] = useState(false); const [error, setError] = useState('');
	const [logo, setLogo] = useState<File | null>(null); const [removeLogo, setRemoveLogo] = useState(false); const [preview, setPreview] = useState('');
	const logoInputRef = useRef<HTMLInputElement>(null); const logoInputId = useId();
	useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
	const logoUrl = preview || (!removeLogo ? client?.logoUrl : null);
	function field(name: Exclude<keyof typeof fields, 'stage'>, value: string) { setFields((previous) => ({ ...previous, [name]: value })); }
	async function save() {
		if (busy) return;
		setBusy(true); setError('');
		try {
			const data = JSON.stringify({ ...fields, removeLogo, ...(client ? { version: client.version } : {}) });
			const form = new FormData(); form.set('data', data); if (logo) form.set('logo', logo);
			const result = await request<Client>(client ? `/${client.id}` : '', { method: client ? 'PATCH' : 'POST', ...(logo ? { body: form } : { headers: { 'Content-Type': 'application/json' }, body: data }) });
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
				<div className="flex items-center gap-4 rounded-xl border border-ink-200 p-4">
					<div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ink-200 bg-white">{logoUrl ? <img src={logoUrl} alt="Vista previa del logo" draggable={false} className="size-full object-contain p-1" /> : <Building aria-hidden="true" className="size-6 text-ink-400" />}</div>
					<div className="min-w-0 flex-1 space-y-1.5"><label htmlFor={logoInputId} className="block text-sm font-medium">Logo de la empresa <span className="font-normal text-ink-500">(opcional)</span></label><input ref={logoInputRef} id={logoInputId} name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" className="block w-full text-xs text-ink-600 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-xs file:font-medium file:text-brand-700 hover:file:bg-brand-100" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 10 * 1024 * 1024) { setError('El logo no puede superar los 10 MB.'); event.target.value = ''; return; } setError(''); setLogo(file); setPreview(URL.createObjectURL(file)); setRemoveLogo(false); }} /><p className="text-xs text-ink-400">PNG, JPEG, WebP, GIF o AVIF. Máximo 10 MB.</p>{logoUrl && <button type="button" className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-red-600" onClick={() => { setLogo(null); setPreview(''); setRemoveLogo(true); if (logoInputRef.current) logoInputRef.current.value = ''; }}><X className="size-3.5" />Quitar logo</button>}</div>
				</div>
				<label className="block space-y-2 text-sm font-medium"><span className="block">Notas</span><textarea name="notes" rows={4} maxLength={5000} placeholder="Información del cliente, detalles del proyecto, próxima conversación…" value={fields.notes} onChange={(event) => field('notes', event.target.value)} className={`${fieldClass} resize-y`} /></label>
			</fieldset>
			{error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
			<div className="mt-6 flex justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className={secondaryButton}>Cancelar</button><button type="submit" disabled={busy || !fields.name.trim()} className={primaryButton}>{busy && <LoaderCircle className="size-4 animate-spin" />}{client ? 'Guardar cambios' : 'Crear cliente'}</button></div>
		</form>
	</Modal>;
}
