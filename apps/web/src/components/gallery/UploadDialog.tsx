import { LoaderCircle, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { ACCEPTED_IMAGES, MAX_IMAGE_BYTES, errorMessage, fieldClass, formatBytes, primaryButton, secondaryButton, type GalleryFolder, type GalleryRequest } from '../../lib/gallery';
import Modal from './Modal';

type QueuedFile = { id: string; file: File };
export default function UploadDialog({ folders, initialFolderId, request, onUploaded, onClose }: {
	folders: GalleryFolder[]; initialFolderId: string; request: GalleryRequest;
	onUploaded: (folderId: string, count: number) => void; onClose: () => void;
}) {
	const [folderId, setFolderId] = useState(initialFolderId || folders[0]?.id || '');
	const [queue, setQueue] = useState<QueuedFile[]>([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
	const [dragging, setDragging] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	function addFiles(files: File[]) {
		setQueue((current) => [...current, ...files.map((file) => ({ id: crypto.randomUUID(), file }))]);
		setError('');
	}
	async function upload() {
		if (!folderId || !queue.length || busy) return;
		setBusy(true); setError('');
		const failed: QueuedFile[] = []; const errors: string[] = []; let uploaded = 0;
		for (const [index, entry] of queue.entries()) {
			setProgress({ current: index + 1, total: queue.length });
			try {
				if (!entry.file.size || entry.file.size > MAX_IMAGE_BYTES) throw new Error('El archivo está vacío o supera los 10 MB.');
				const body = new FormData(); body.set('file', entry.file);
				await request(`/folders/${folderId}/images`, { method: 'POST', body }); uploaded++;
			} catch (cause) { failed.push(entry); errors.push(`${entry.file.name}: ${errorMessage(cause)}`); }
		}
		setBusy(false); setProgress(null); setQueue(failed);
		if (uploaded) onUploaded(folderId, uploaded);
		if (failed.length) setError(errors.join('\n')); else onClose();
	}
	return (
		<Modal title="Subir imágenes" busy={busy} onClose={onClose}>
			<form onSubmit={(event) => { event.preventDefault(); void upload(); }} className="p-6">
				<label className="mb-2 block text-sm font-medium" htmlFor="upload-folder">Carpeta de destino</label>
				<select id="upload-folder" required disabled={busy} value={folderId} onChange={(event) => setFolderId(event.target.value)} className={fieldClass}>
					{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
				</select>
				<div onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)}
					onDrop={(event) => { event.preventDefault(); setDragging(false); if (!busy) addFiles(Array.from(event.dataTransfer.files)); }}
					className={`mt-5 rounded-xl border-2 border-dashed p-6 text-center ${dragging ? 'border-brand-600 bg-brand-100' : 'border-ink-200 bg-brand-50/50'}`}>
					<Upload className="mx-auto mb-3 size-7 text-brand-600" /><p className="text-sm font-medium">Arrastra tus imágenes aquí</p>
					<p className="mt-1 text-xs text-ink-500">JPEG, PNG, WebP, GIF o AVIF · Hasta 10 MB por imagen</p>
					<button type="button" disabled={busy} className={`${secondaryButton} mt-4`} onClick={() => fileInputRef.current?.click()}>Seleccionar archivos</button>
					<input ref={fileInputRef} type="file" multiple accept={ACCEPTED_IMAGES} className="sr-only" aria-label="Seleccionar imágenes" disabled={busy}
						onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
				</div>
				{!!queue.length && <ul aria-label="Archivos seleccionados" className="mt-4 max-h-40 space-y-2 overflow-y-auto">
					{queue.map((entry) => <li key={entry.id} className="flex items-center gap-3 rounded-lg bg-ink-50 px-3 py-2 text-xs">
						<span className="min-w-0 flex-1 truncate">{entry.file.name}</span><span className="shrink-0 text-ink-400">{formatBytes(entry.file.size)}</span>
						<button type="button" disabled={busy} onClick={() => setQueue((current) => current.filter((file) => file.id !== entry.id))} aria-label={`Quitar ${entry.file.name}`} className="text-ink-500 disabled:opacity-30"><X className="size-4" /></button>
					</li>)}
				</ul>}
				{error && <p role="alert" className="mt-4 max-h-40 overflow-y-auto rounded-lg bg-red-50 p-3 text-sm whitespace-pre-line text-red-700">{error}</p>}
				{progress && <p role="status" className="mt-4 text-sm text-brand-600">Subiendo imagen {progress.current} de {progress.total}…</p>}
				<div className="mt-6 flex justify-end gap-2">
					<button type="button" disabled={busy} className={secondaryButton} onClick={onClose}>Cancelar</button>
					<button type="submit" disabled={busy || !queue.length || !folderId} className={primaryButton}>
						{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
						{busy ? 'Subiendo…' : `Subir${queue.length ? ` ${queue.length}` : ''} ${queue.length === 1 ? 'imagen' : 'imágenes'}`}
					</button>
				</div>
			</form>
		</Modal>
	);
}
