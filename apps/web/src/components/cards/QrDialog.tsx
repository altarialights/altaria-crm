import { Check, Copy, Download, Maximize, Minimize } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Card } from '../../lib/cards';
import { errorMessage, primaryButton, secondaryButton } from '../../lib/gallery';
import Modal from '../gallery/Modal';

export default function QrDialog({ card, onClose }: { card: Card; onClose: () => void }) {
	const stageRef = useRef<HTMLDivElement>(null);
	const [qr, setQr] = useState<{ png: string; svg: string } | null>(null);
	const [error, setError] = useState('');
	const [copied, setCopied] = useState(false);
	const [fullscreen, setFullscreen] = useState(false);
	useEffect(() => {
		let cancelled = false; let objectUrl: string | undefined;
		async function generate() {
			try {
				const { default: QRCode } = await import('qrcode');
				const options = { errorCorrectionLevel: 'M' as const, margin: 4, width: 1600, color: { dark: '#000000', light: '#ffffff' } };
				const [png, svg] = await Promise.all([QRCode.toDataURL(card.publicUrl, options), QRCode.toString(card.publicUrl, { ...options, type: 'svg' })]);
				if (cancelled) return;
				objectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); setQr({ png, svg: objectUrl });
			} catch (cause) { if (!cancelled) setError(errorMessage(cause)); }
		}
		void generate();
		return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
	}, [card.publicUrl]);
	useEffect(() => {
		const update = () => setFullscreen(document.fullscreenElement === stageRef.current);
		document.addEventListener('fullscreenchange', update);
		return () => document.removeEventListener('fullscreenchange', update);
	}, []);
	async function copy() {
		try { await navigator.clipboard.writeText(card.publicUrl); setCopied(true); } catch { setError('No se pudo copiar. Puedes seleccionar el enlace y copiarlo manualmente.'); }
	}
	async function toggleFullscreen() {
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else if (stageRef.current?.requestFullscreen) await stageRef.current.requestFullscreen();
			else setError('Tu navegador no admite pantalla completa. Puedes descargar el QR o capturarlo desde esta ventana.');
		} catch { setError('No se pudo abrir la pantalla completa. Puedes descargar el QR o capturarlo desde esta ventana.'); }
	}
	return <Modal title={`QR · ${card.reference}`} wide onClose={onClose}>
		<div className="p-5 sm:p-6">
			<div ref={stageRef} className="flex flex-col items-center justify-center bg-white text-center fullscreen:h-dvh fullscreen:w-screen fullscreen:p-6">
				{qr ? <img src={qr.png} alt={`Código QR de ${card.reference}`} width={1600} height={1600} className={`max-w-full object-contain ${fullscreen ? 'size-[min(78dvh,85vw)]' : 'size-[min(52dvh,28rem)]'}`} /> : <p role="status" className="py-16 text-sm text-ink-500">Generando QR…</p>}
				<p className="mt-2 font-medium">{card.reference}</p>
				{fullscreen && <button type="button" onClick={() => void toggleFullscreen()} className={`${secondaryButton} mt-4`}><Minimize className="size-4" />Salir de pantalla completa</button>}
			</div>
			<p className="mt-4 text-center text-sm text-ink-500">Escanear el QR o leer el NFC abre este mismo enlace permanente.</p>
			<div className="mt-3 flex items-center gap-2 rounded-lg border border-ink-200 bg-brand-50 p-3"><input readOnly value={card.publicUrl} aria-label="Enlace permanente" className="min-w-0 flex-1 bg-transparent text-sm text-ink-600 outline-offset-2" onFocus={(event) => event.target.select()} /><button type="button" onClick={() => void copy()} aria-label="Copiar enlace del QR" className="rounded-md p-2 text-brand-600 hover:bg-brand-100">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}</button></div>
			{copied && <p role="status" className="mt-2 text-sm text-emerald-700">Enlace copiado.</p>}
			{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
			<div className="mt-5 flex flex-wrap justify-center gap-2"><button type="button" disabled={!qr} onClick={() => void toggleFullscreen()} className={secondaryButton}><Maximize className="size-4" />Pantalla completa</button>{qr && <><a href={qr.png} download={`qr-${card.id}.png`} className={primaryButton}><Download className="size-4" />Descargar PNG</a><a href={qr.svg} download={`qr-${card.id}.svg`} className={secondaryButton}><Download className="size-4" />Descargar SVG</a></>}</div>
		</div>
	</Modal>;
}
