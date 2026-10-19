import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

export default function Modal({ title, busy, onClose, children, wide = false }: {
	title: string; busy?: boolean; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const titleId = useId();
	useEffect(() => {
		const dialog = dialogRef.current;
		dialog?.showModal();
		return () => dialog?.close();
	}, []);
	return (
		<dialog ref={dialogRef} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
			className={`fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl border border-ink-200 bg-white p-0 text-brand-900 shadow-2xl backdrop:bg-brand-950/50 ${wide ? 'max-w-4xl' : 'max-w-lg'}`}>
			<div className="flex items-center justify-between gap-4 border-b border-ink-200 px-6 py-4">
				<h2 id={titleId} className="text-lg font-semibold">{title}</h2>
				<button type="button" disabled={busy} onClick={onClose} aria-label="Cerrar ventana" className="rounded-lg p-2 text-ink-500 hover:bg-brand-50 disabled:opacity-40"><X className="size-5" /></button>
			</div>
			{children}
		</dialog>
	);
}
