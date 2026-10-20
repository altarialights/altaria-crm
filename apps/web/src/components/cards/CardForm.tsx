import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import type { Card, CardRequest, CardStatus } from '../../lib/cards';
import { errorMessage, fieldClass, primaryButton, secondaryButton, type GalleryRequest } from '../../lib/gallery';
import Modal from '../gallery/Modal';
import DesignPicker from './DesignPicker';

export default function CardForm({ card, request, galleryRequest, onClose, onSaved }: {
	card?: Card; request: CardRequest; galleryRequest: GalleryRequest; onClose: () => void; onSaved: (card: Card) => void;
}) {
	const [reference, setReference] = useState(card?.reference ?? '');
	const [clientName, setClientName] = useState(card?.clientName ?? '');
	const [targetUrl, setTargetUrl] = useState(card?.targetUrl ?? '');
	const [status, setStatus] = useState<CardStatus>(card?.status ?? 'free');
	const [design, setDesign] = useState(card?.designId ? { id: card.designId, name: card.designName ?? 'Diseño seleccionado' } : null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	async function save() {
		if (busy) return;
		setBusy(true); setError('');
		try {
			const saved = await request<Card>(card ? `/${card.id}` : '', { method: card ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference, clientName, targetUrl, status, designId: design?.id ?? null }) });
			onSaved(saved);
		} catch (cause) { setError(errorMessage(cause)); }
		finally { setBusy(false); }
	}
	return <Modal title={card ? 'Editar tarjeta' : 'Nueva tarjeta'} busy={busy} wide onClose={onClose}>
		<form onSubmit={(event) => { event.preventDefault(); void save(); }} className="p-6">
			<fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
				<div className="grid gap-5 sm:grid-cols-2">
					<label className="space-y-2 text-sm font-medium"><span className="block">Nombre</span><input autoFocus required maxLength={100} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Por ejemplo, Tarjeta de Ana" className={fieldClass} /></label>
					<label className="space-y-2 text-sm font-medium"><span className="block">Estado</span><select value={status} onChange={(event) => setStatus(event.target.value as CardStatus)} className={fieldClass}><option value="free">Libre, sin asignar</option><option value="active">Activa</option><option value="paused">Pausada</option></select></label>
				</div>
				{status !== 'free' ? <div className="grid gap-5 sm:grid-cols-2">
					<label className="space-y-2 text-sm font-medium"><span className="block">Cliente</span><input required maxLength={200} value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Nombre de la persona o empresa" className={fieldClass} /></label>
					<label className="space-y-2 text-sm font-medium"><span className="block">URL de destino</span><input type="url" required maxLength={2048} value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} placeholder="https://ejemplo.com" className={fieldClass} /></label>
				</div> : <p className="rounded-lg bg-brand-50 p-3 text-sm text-ink-600">La tarjeta queda disponible para asignarla a un cliente. Su enlace QR y NFC se conserva siempre.</p>}
				<div><p className="mb-2 text-sm font-medium">Diseño de la galería <span className="font-normal text-ink-400">(opcional)</span></p><DesignPicker selected={design} onChange={setDesign} request={galleryRequest} /></div>
				{card && <div className="rounded-lg border border-ink-200 p-3"><p className="mb-1 text-xs font-medium text-ink-500">Enlace permanente del QR y NFC</p><p className="break-all text-sm">{card.publicUrl}</p></div>}
			</fieldset>
			{error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
			<div className="mt-6 flex justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className={secondaryButton}>Cancelar</button><button type="submit" disabled={busy || !reference.trim()} className={primaryButton}>{busy && <LoaderCircle className="size-4 animate-spin" />}{card ? 'Guardar cambios' : 'Crear tarjeta'}</button></div>
		</form>
	</Modal>;
}
