export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_IMAGES = 'image/jpeg,image/png,image/webp,image/gif,image/avif';
export type GalleryFolder = { id: string; name: string; storagePrefix: string; imageCount: number };
export type GalleryImage = {
	id: string; folderId: string; folderName: string; name: string; originalFilename: string;
	contentType: string; sizeBytes: number; createdAt: string;
};
export type ImageListing = { images: GalleryImage[]; total: number; page: number; pageSize: number };
export type GalleryRequest = <T>(path: string, init?: RequestInit) => Promise<T>;
export function imageUrl(id: string) { return `/tarjetas/archivo/${encodeURIComponent(id)}`; }
export function formatBytes(bytes: number) {
	return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`;
}
export const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-50';
export const secondaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-medium text-ink-600 transition-colors hover:bg-brand-50 disabled:opacity-50';
export const fieldClass = 'w-full rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-sm outline-offset-2 placeholder:text-ink-400';
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'No se pudo completar la operación. Inténtalo de nuevo.'; }
