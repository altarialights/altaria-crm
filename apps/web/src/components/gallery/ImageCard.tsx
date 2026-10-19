import { ImageOff, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { formatBytes, imageUrl, type GalleryImage } from '../../lib/gallery';

export default function ImageCard({ image, onPreview, onRename, onDelete }: {
	image: GalleryImage; onPreview: () => void; onRename: () => void; onDelete: () => void;
}) {
	const [failed, setFailed] = useState(false);
	return (
		<li className="group overflow-hidden rounded-xl border border-ink-200 bg-white transition-shadow hover:shadow-md hover:shadow-brand-950/5">
			<button type="button" className="block aspect-video w-full overflow-hidden bg-brand-50 p-3" onClick={onPreview} aria-label={`Ver ${image.name}`}>
				{failed ? <span className="flex h-full flex-col items-center justify-center gap-2 text-xs text-ink-500"><ImageOff className="size-6" />No se pudo cargar la imagen</span>
					: <img src={imageUrl(image.id)} alt={image.name} loading="lazy" decoding="async" width={480} height={270} onError={() => setFailed(true)} className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:transition-none" />}
			</button>
			<div className="flex items-center gap-3 p-3">
				<div className="min-w-0 flex-1">
					<h3 className="truncate text-sm font-medium" title={image.name}>{image.name}</h3>
					<p className="mt-1 flex items-center gap-1 text-xs text-ink-500"><span className="truncate" title={image.folderName}>{image.folderName}</span><span className="shrink-0 text-ink-300">·</span><span className="shrink-0">{formatBytes(image.sizeBytes)}</span></p>
				</div>
				<div className="flex shrink-0 gap-1">
					<button type="button" onClick={onRename} aria-label={`Cambiar nombre de ${image.name}`} title="Cambiar nombre" className="rounded-md p-1.5 text-ink-400 hover:bg-brand-50 hover:text-brand-600"><Pencil className="size-4" /></button>
					<button type="button" onClick={onDelete} aria-label={`Eliminar ${image.name}`} title="Eliminar diseño" className="rounded-md p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="size-4" /></button>
				</div>
			</div>
		</li>
	);
}
