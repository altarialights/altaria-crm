import { useAuth } from '@clerk/astro/react';
import { CheckCircle2, ChevronLeft, ChevronRight, Download, Folder, FolderOpen, FolderPlus, Images, LoaderCircle, Pencil, Search, Trash2, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { errorMessage, fieldClass, formatBytes, imageUrl, primaryButton, secondaryButton, type GalleryFolder, type GalleryImage, type ImageListing } from '../../lib/gallery';
import Modal from './Modal';
import ImageCard from './ImageCard';
import UploadDialog from './UploadDialog';

type DialogState = { kind: 'create' | 'upload' } | { kind: 'renameFolder' | 'deleteFolder'; folder: GalleryFolder } | { kind: 'renameImage' | 'deleteImage' | 'preview'; image: GalleryImage };

export default function Gallery() {
	const { getToken, isLoaded, isSignedIn } = useAuth();
	if (!isLoaded) return <><h1 className="text-2xl font-semibold tracking-tight">Galería de diseños</h1><p className="mt-8 text-sm text-ink-500" role="status">Cargando galería…</p></>;
	if (!isSignedIn) return <><h1 className="text-2xl font-semibold tracking-tight">Galería de diseños</h1><p className="mt-8 text-sm text-ink-600">Vuelve a iniciar sesión para acceder a tus diseños.</p></>;
	return <GalleryView getToken={getToken} />;
}

export function GalleryView({ getToken }: { getToken: () => Promise<string | null> }) {
	const [folders, setFolders] = useState<GalleryFolder[]>([]);
	const [listing, setListing] = useState<ImageListing>({ images: [], total: 0, page: 1, pageSize: 24 });
	const [folderId, setFolderId] = useState('');
	const [searchInput, setSearchInput] = useState('');
	const [search, setSearch] = useState('');
	const [page, setPage] = useState(1);
	const [refresh, setRefresh] = useState(0);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState('');
	const [notice, setNotice] = useState('');
	const [dialog, setDialog] = useState<DialogState | null>(null);
	const [name, setName] = useState('');
	const [busy, setBusy] = useState(false);
	const [dialogError, setDialogError] = useState('');
	const selectedFolder = folders.find((folder) => folder.id === folderId);
	const request = useCallback(async <T,>(path: string, init?: RequestInit) => apiFetch<T>(`/v1/gallery${path}`, await getToken(), init), [getToken]);

	useEffect(() => {
		const timer = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 250);
		return () => clearTimeout(timer);
	}, [searchInput]);
	useEffect(() => {
		const controller = new AbortController();
		async function load() {
			setLoading(true); setLoadError('');
			const query = new URLSearchParams({ page: String(page) });
			if (folderId) query.set('folderId', folderId);
			if (search) query.set('search', search);
			try {
				const [folderData, imageData] = await Promise.all([
					request<{ folders: GalleryFolder[] }>('/folders', { signal: controller.signal }),
					request<ImageListing>(`/images?${query}`, { signal: controller.signal }),
				]);
				if (controller.signal.aborted) return;
				setFolders(folderData.folders);
				if (folderId && !folderData.folders.some((folder) => folder.id === folderId)) { setFolderId(''); setPage(1); return; }
				const maxPage = Math.max(1, Math.ceil(imageData.total / imageData.pageSize));
				if (page > maxPage) { setPage(maxPage); return; }
				setListing(imageData);
			} catch (error) { if (!controller.signal.aborted) setLoadError(errorMessage(error)); }
			finally { if (!controller.signal.aborted) setLoading(false); }
		}
		void load();
		return () => controller.abort();
	}, [folderId, page, search, refresh, request]);

	function openDialog(value: DialogState) {
		setDialogError(''); setNotice('');
		setName('folder' in value ? value.folder.name : 'image' in value ? value.image.name : '');
		setDialog(value);
	}
	function chooseFolder(id: string) { setFolderId(id); setPage(1); }
	function refreshData() { setRefresh((value) => value + 1); }
	async function save() {
		if (!dialog || dialog.kind === 'upload' || dialog.kind === 'preview' || busy) return;
		setBusy(true); setDialogError('');
		try {
			const json = { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) };
			switch (dialog.kind) {
				case 'create': {
					const created = await request<GalleryFolder>('/folders', { ...json, method: 'POST' });
					chooseFolder(created.id); setNotice('Carpeta creada. Ya puedes subir tus diseños.'); break;
				}
				case 'renameFolder': await request(`/folders/${dialog.folder.id}`, { ...json, method: 'PATCH' }); setNotice('Nombre de la carpeta actualizado.'); break;
				case 'deleteFolder': await request(`/folders/${dialog.folder.id}`, { method: 'DELETE' }); chooseFolder(''); setNotice('Carpeta eliminada.'); break;
				case 'renameImage': await request(`/images/${dialog.image.id}`, { ...json, method: 'PATCH' }); setNotice('Nombre del diseño actualizado.'); break;
				case 'deleteImage': await request(`/images/${dialog.image.id}`, { method: 'DELETE' }); setNotice('Diseño eliminado.'); break;
			}
			setDialog(null); refreshData();
		} catch (error) { setDialogError(errorMessage(error)); }
		finally { setBusy(false); }
	}
	const totalImages = folders.reduce((sum, folder) => sum + folder.imageCount, 0);
	const totalPages = Math.max(1, Math.ceil(listing.total / listing.pageSize));
	const deleting = dialog?.kind === 'deleteFolder' || dialog?.kind === 'deleteImage';
	const editingName = dialog && ['create', 'renameFolder', 'renameImage'].includes(dialog.kind);
	const dialogTitle = dialog?.kind === 'create' ? 'Nueva carpeta' : dialog?.kind === 'preview' ? dialog.image.name : deleting ? 'Confirmar eliminación' : 'Cambiar nombre';

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="mb-6 flex flex-wrap items-center justify-between gap-4">
				<h1 className="text-2xl font-semibold tracking-tight">Galería de diseños</h1>
				<div className="flex flex-wrap gap-2">
					<button type="button" onClick={() => openDialog({ kind: 'create' })} className={secondaryButton}><FolderPlus className="size-4" />Nueva carpeta</button>
					<button type="button" disabled={!folders.length || loading || !!loadError} onClick={() => openDialog({ kind: 'upload' })} className={primaryButton}><Upload className="size-4" />Subir imágenes</button>
				</div>
			</div>
			{notice && <div role="status" className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 size-4 shrink-0" /><span className="flex-1">{notice}</span><button type="button" aria-label="Cerrar aviso" onClick={() => setNotice('')}><X className="size-4" /></button></div>}
			<div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white lg:grid lg:grid-cols-[230px_minmax(0,1fr)]">
				<aside aria-label="Carpetas de diseños" className="border-b border-ink-200 bg-ink-50/50 p-4 lg:border-r lg:border-b-0">
					<h2 className="mb-3 px-2 text-xs font-medium tracking-wider text-ink-400 uppercase">Biblioteca</h2>
					<ul className="space-y-1">
						<li><button type="button" onClick={() => chooseFolder('')} aria-pressed={!folderId} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-ink-600 hover:bg-brand-50 aria-pressed:bg-brand-100 aria-pressed:font-medium aria-pressed:text-brand-900"><Images className="size-4 shrink-0 text-brand-600" /><span className="flex-1">Todos los diseños</span><span className="text-xs tabular-nums text-ink-400">{totalImages}</span></button></li>
						{folders.map((folder) => <li key={folder.id}><button type="button" onClick={() => chooseFolder(folder.id)} aria-pressed={folderId === folder.id} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-ink-600 hover:bg-brand-50 aria-pressed:bg-brand-100 aria-pressed:font-medium aria-pressed:text-brand-900"><Folder className="size-4 shrink-0 text-ink-400" /><span className="min-w-0 flex-1 truncate" title={folder.name}>{folder.name}</span><span className="text-xs tabular-nums text-ink-400">{folder.imageCount}</span></button></li>)}
					</ul>
					<button type="button" className="mt-4 flex items-center gap-2 px-3 py-2 text-sm text-brand-600 hover:text-brand-900" onClick={() => openDialog({ kind: 'create' })}><FolderPlus className="size-4" />Crear carpeta</button>
				</aside>
				<section aria-label="Diseños" aria-busy={loading} className="flex min-w-0 flex-1 flex-col p-5 sm:p-6">
					<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
						<div className="flex min-w-0 items-center gap-2"><h2 className="truncate font-semibold">{selectedFolder?.name ?? 'Todos los diseños'}</h2>{selectedFolder && <>
							<button type="button" title="Cambiar nombre de carpeta" aria-label="Cambiar nombre de carpeta" onClick={() => openDialog({ kind: 'renameFolder', folder: selectedFolder })} className="rounded-lg p-2 text-ink-400 hover:bg-brand-50 hover:text-brand-600"><Pencil className="size-4" /></button>
							<button type="button" disabled={!!selectedFolder.imageCount} title={selectedFolder.imageCount ? 'Vacía la carpeta antes de eliminarla' : 'Eliminar carpeta'} aria-label="Eliminar carpeta" onClick={() => openDialog({ kind: 'deleteFolder', folder: selectedFolder })} className="rounded-lg p-2 text-ink-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"><Trash2 className="size-4" /></button>
						</>}</div>
						<label className="relative block w-full sm:w-60"><span className="sr-only">Buscar diseños</span><Search className="pointer-events-none absolute top-3 left-3 size-4 text-ink-400" /><input type="search" maxLength={200} placeholder="Buscar diseños…" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className={`${fieldClass} pl-9`} /></label>
					</div>
					{loadError ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"><p>{loadError}</p><button type="button" className="mt-3 font-medium underline" onClick={refreshData}>Volver a intentar</button></div>
						: loading ? <div role="status" className="flex min-h-64 flex-1 items-center justify-center gap-3 text-sm text-ink-500"><LoaderCircle className="size-5 animate-spin" />Cargando diseños…</div>
						: !listing.images.length ? <div className="flex min-h-72 flex-1 flex-col items-center justify-center px-4 py-10 text-center">
							<div className="mb-5 grid size-14 place-items-center rounded-2xl bg-brand-50">{search ? <Search className="size-6 text-brand-600" /> : <FolderOpen className="size-6 text-brand-600" />}</div>
							<h3 className="font-semibold">{search ? 'No hay diseños con ese nombre' : !folders.length ? 'Tu primer diseño empieza aquí' : 'Todo listo para tus diseños'}</h3>
							<p className="mt-2 max-w-sm text-sm leading-6 text-ink-500">{search ? 'Prueba con otra búsqueda o elige otra carpeta.' : !folders.length ? 'Crea una carpeta para organizar las tarjetas de restaurantes, peluquerías o cualquier otro proyecto.' : 'Sube imágenes a una carpeta y ten tus diseños siempre a mano.'}</p>
							{!search && <button type="button" onClick={() => openDialog({ kind: folders.length ? 'upload' : 'create' })} className={`${primaryButton} mt-6`}>{folders.length ? <Upload className="size-4" /> : <FolderPlus className="size-4" />}{folders.length ? 'Subir imágenes' : 'Crear primera carpeta'}</button>}
						</div> : <>
							<ul className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{listing.images.map((image) => <ImageCard key={image.id} image={image} onPreview={() => openDialog({ kind: 'preview', image })} onRename={() => openDialog({ kind: 'renameImage', image })} onDelete={() => openDialog({ kind: 'deleteImage', image })} />)}</ul>
							<div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 pt-4 text-xs text-ink-500">
								<p>{(page - 1) * listing.pageSize + 1}–{Math.min(page * listing.pageSize, listing.total)} de {listing.total} diseños</p><div className="flex items-center gap-3">
									<button type="button" aria-label="Página anterior" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-ink-200 p-2 hover:bg-brand-50 disabled:opacity-30"><ChevronLeft className="size-4" /></button><span>{page} / {totalPages}</span>
									<button type="button" aria-label="Página siguiente" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-ink-200 p-2 hover:bg-brand-50 disabled:opacity-30"><ChevronRight className="size-4" /></button>
								</div>
							</div>
						</>}
				</section>
			</div>
			{dialog?.kind === 'upload' ? <UploadDialog folders={folders} initialFolderId={folderId} request={request} onClose={() => setDialog(null)} onUploaded={(id, count) => { chooseFolder(id); setSearchInput(''); setNotice(count === 1 ? 'Se ha subido 1 imagen.' : `Se han subido ${count} imágenes.`); refreshData(); }} /> : dialog && <Modal title={dialogTitle} busy={busy} wide={dialog.kind === 'preview'} onClose={() => setDialog(null)}>
				{dialog.kind === 'preview' ? <div className="p-6"><img src={imageUrl(dialog.image.id)} alt={dialog.image.name} className="mx-auto max-h-[60dvh] max-w-full rounded-lg object-contain" /><div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-500"><p>{dialog.image.folderName} · {formatBytes(dialog.image.sizeBytes)}</p><a href={imageUrl(dialog.image.id)} download={dialog.image.originalFilename} className={secondaryButton}><Download className="size-4" />Descargar original</a></div></div> : <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="p-6">
					{editingName && <><label className="mb-2 block text-sm font-medium" htmlFor="gallery-name">{dialog.kind === 'renameImage' ? 'Nombre del diseño' : 'Nombre de la carpeta'}</label><input id="gallery-name" type="text" required maxLength={dialog.kind === 'renameImage' ? 200 : 100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Por ejemplo, Restaurantes" className={fieldClass} disabled={busy} /></>}
					{deleting && <p className="text-sm leading-6 text-ink-600">{dialog.kind === 'deleteImage' ? <>Se eliminará <strong className="text-brand-900">{dialog.image.name}</strong> de la galería. Esta acción no se puede deshacer.</> : dialog.kind === 'deleteFolder' ? <>Se eliminará la carpeta vacía <strong className="text-brand-900">{dialog.folder.name}</strong>.</> : null}</p>}
					{dialogError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{dialogError}</p>}
					<div className="mt-6 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setDialog(null)} className={secondaryButton}>Cancelar</button><button type="submit" disabled={busy || (!!editingName && !name.trim())} className={deleting ? 'inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50' : primaryButton}>{busy && <LoaderCircle className="size-4 animate-spin" />}{deleting ? 'Eliminar' : dialog.kind === 'create' ? 'Crear carpeta' : 'Guardar nombre'}</button></div>
				</form>}
			</Modal>}
		</div>
	);
}
