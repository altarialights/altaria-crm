import { ChevronLeft, ChevronRight, ImagePlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { errorMessage, fieldClass, imageUrl, secondaryButton, type GalleryImage, type GalleryRequest, type ImageListing } from '../../lib/gallery';

export default function DesignPicker({ selected, onChange, request }: {
	selected: { id: string; name: string } | null; onChange: (image: { id: string; name: string } | null) => void; request: GalleryRequest;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState('');
	const [page, setPage] = useState(1);
	const [listing, setListing] = useState<ImageListing | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	useEffect(() => {
		if (!open) return;
		const controller = new AbortController();
		const timer = setTimeout(() => {
			setLoading(true); setError('');
			const query = new URLSearchParams({ page: String(page), pageSize: '6', search });
			void request<ImageListing>(`/images?${query}`, { signal: controller.signal }).then((data) => {
				if (!controller.signal.aborted) setListing(data);
			}).catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorMessage(cause)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
		}, 200);
		return () => { clearTimeout(timer); controller.abort(); };
	}, [open, search, page, request]);
	function choose(image: GalleryImage) { onChange({ id: image.id, name: image.name }); setOpen(false); }
	return <div className="space-y-3">
		<div className="flex items-center gap-3">
			{selected && <><img src={imageUrl(selected.id)} alt="" className="h-12 w-20 rounded-md bg-brand-50 object-contain" /><span className="min-w-0 flex-1 truncate text-sm">{selected.name}</span><button type="button" aria-label="Quitar diseño" onClick={() => onChange(null)} className="rounded-lg p-2 text-ink-500 hover:bg-brand-50"><X className="size-4" /></button></>}
			<button type="button" onClick={() => setOpen((value) => !value)} className={secondaryButton}><ImagePlus className="size-4" />{selected ? 'Cambiar diseño' : 'Elegir diseño'}</button>
		</div>
		{open && <div className="rounded-xl border border-ink-200 p-3">
			<label><span className="sr-only">Buscar en la galería</span><input type="search" placeholder="Buscar en la galería…" value={search} maxLength={200} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className={fieldClass} /></label>
			{error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : loading ? <p role="status" className="mt-3 text-sm text-ink-500">Cargando diseños…</p> : <>
				<div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{listing?.images.map((image) => <button key={image.id} type="button" aria-label={`Seleccionar ${image.name}`} onClick={() => choose(image)} className="min-w-0 rounded-lg border border-ink-200 p-2 text-left hover:border-brand-500"><img src={imageUrl(image.id)} alt="" className="aspect-video w-full rounded bg-brand-50 object-contain" /><span className="mt-1 block truncate text-xs">{image.name}</span></button>)}</div>
				{listing?.total === 0 && <p className="mt-3 text-sm text-ink-500">No hay diseños. Puedes subirlos desde la galería.</p>}
			</>}
			<div className="mt-3 flex items-center justify-end gap-3 text-xs text-ink-500"><button type="button" aria-label="Diseños anteriores" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded p-1 disabled:opacity-30"><ChevronLeft className="size-4" /></button><span>{page} / {Math.max(1, Math.ceil((listing?.total ?? 0) / 6))}</span><button type="button" aria-label="Más diseños" disabled={loading || !listing || page * 6 >= listing.total} onClick={() => setPage((value) => value + 1)} className="rounded p-1 disabled:opacity-30"><ChevronRight className="size-4" /></button></div>
		</div>}
	</div>;
}
