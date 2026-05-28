import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";

type FolderColor = "blue" | "purple" | "emerald" | "amber" | "rose" | "slate";

type Folder = {
  id: string;
  parent_folder_id: string | null;
  scope: string;
  client_id: string | null;
  name: string;
  color: FolderColor | string;
  icon: string;
  position: number;
  created_at: string;
  updated_at: string;
};

type Document = {
  id: string;
  folder_id: string | null;
  scope: string;
  client_id: string | null;
  title: string;
  description: string | null;
  category: string;
  provider: string;
  blob_access: string;
  blob_pathname: string;
  original_file_name: string;
  stored_file_name: string;
  mime_type: string | null;
  size_bytes: number;
  status: string;
  created_at: string;
  updated_at: string;
};

type BreadcrumbItem = { id: string; name: string };

type FoldersResponse = { ok: true; folders: Folder[] };
type FolderResponse = { ok: true; folder: Folder; breadcrumb?: BreadcrumbItem[] };
type DocumentsResponse = { ok: true; documents: Document[] };
type DocumentResponse = { ok: true; document: Document };

const colorClasses: Record<string, { gradient: string; ring: string; text: string }> = {
  blue: {
    gradient: "from-sky-400 to-blue-500",
    ring: "ring-sky-400/40",
    text: "text-sky-300",
  },
  purple: {
    gradient: "from-violet-400 to-fuchsia-500",
    ring: "ring-violet-400/40",
    text: "text-violet-300",
  },
  emerald: {
    gradient: "from-emerald-400 to-teal-500",
    ring: "ring-emerald-400/40",
    text: "text-emerald-300",
  },
  amber: {
    gradient: "from-amber-300 to-orange-500",
    ring: "ring-amber-400/40",
    text: "text-amber-300",
  },
  rose: {
    gradient: "from-rose-400 to-pink-500",
    ring: "ring-rose-400/40",
    text: "text-rose-300",
  },
  slate: {
    gradient: "from-slate-400 to-slate-600",
    ring: "ring-slate-400/40",
    text: "text-slate-300",
  },
};

const colorOptions: FolderColor[] = ["blue", "purple", "emerald", "amber", "rose", "slate"];

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function fileKind(mime: string | null, name: string): "pdf" | "image" | "word" | "excel" | "generic" {
  const m = (mime || "").toLowerCase();
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (m.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "heic"].includes(ext)) return "image";
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (m.includes("word") || ["doc", "docx", "odt", "rtf"].includes(ext)) return "word";
  if (m.includes("excel") || m.includes("spreadsheet") || ["xls", "xlsx", "ods", "csv"].includes(ext)) return "excel";
  return "generic";
}

function FolderIcon({ color }: { color: string }) {
  const c = colorClasses[color] || colorClasses.blue;
  return (
    <div className="relative w-full">
      <div className="absolute -top-2 left-3 h-3 w-12 rounded-t-md bg-gradient-to-br opacity-90"
        style={{
          backgroundImage: "linear-gradient(135deg, var(--tw-gradient-stops))",
        }}
      >
        <div className={`h-full w-full rounded-t-md bg-gradient-to-br ${c.gradient}`} />
      </div>
      <div
        className={`aspect-[5/4] w-full rounded-xl bg-gradient-to-br ${c.gradient} shadow-[0_18px_45px_rgba(0,0,0,0.32)] ring-1 ${c.ring}`}
      >
        <div className="flex h-full w-full items-end justify-end p-3">
          <svg viewBox="0 0 24 24" className="h-6 w-6 opacity-70" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function FileIcon({ kind }: { kind: ReturnType<typeof fileKind> }) {
  const label =
    kind === "pdf" ? "PDF" :
    kind === "word" ? "DOC" :
    kind === "excel" ? "XLS" :
    kind === "image" ? "IMG" : "FILE";
  const gradient =
    kind === "pdf" ? "from-rose-500 to-red-600" :
    kind === "word" ? "from-sky-500 to-blue-600" :
    kind === "excel" ? "from-emerald-500 to-green-600" :
    kind === "image" ? "from-fuchsia-500 to-pink-600" :
    "from-slate-500 to-slate-700";

  return (
    <div className={`relative aspect-[3/4] w-full rounded-xl bg-gradient-to-br ${gradient} shadow-[0_18px_45px_rgba(0,0,0,0.32)] ring-1 ring-white/10`}>
      <div className="absolute right-0 top-0 h-6 w-6 rounded-bl-xl bg-white/15 backdrop-blur" />
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 p-3">
        <span className="rounded-md bg-black/30 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white/95 backdrop-blur">
          {label}
        </span>
      </div>
    </div>
  );
}

export default function DocumentsApp() {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showFolderForm, setShowFolderForm] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState<FolderColor>("blue");
  const [creatingFolder, setCreatingFolder] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);

  const loadContents = useCallback(async (folderId: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const foldersUrl = `/api/document-folders${folderId ? `?parentId=${encodeURIComponent(folderId)}` : ""}`;
      const docsUrl = `/api/documents${folderId ? `?folderId=${encodeURIComponent(folderId)}` : ""}`;
      const [foldersRes, docsRes] = await Promise.all([
        api<FoldersResponse>(foldersUrl),
        api<DocumentsResponse>(docsUrl),
      ]);
      setFolders(foldersRes.folders || []);
      setDocuments(docsRes.documents || []);

      if (folderId) {
        try {
          const folderRes = await api<FolderResponse>(`/api/document-folders/${folderId}`);
          setBreadcrumb(folderRes.breadcrumb || [{ id: folderRes.folder.id, name: folderRes.folder.name }]);
        } catch {
          setBreadcrumb([]);
        }
      } else {
        setBreadcrumb([]);
      }
    } catch (e: any) {
      setError(e?.message || "Error cargando documentos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContents(currentFolderId);
  }, [currentFolderId, loadContents]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const enterFolder = (folder: Folder) => {
    setCurrentFolderId(folder.id);
  };

  const goUp = () => {
    if (breadcrumb.length <= 1) {
      setCurrentFolderId(null);
      return;
    }
    const parent = breadcrumb[breadcrumb.length - 2];
    setCurrentFolderId(parent.id);
  };

  const goToBreadcrumb = (item: BreadcrumbItem | null) => {
    setCurrentFolderId(item ? item.id : null);
  };

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      setError("El nombre de la carpeta es obligatorio");
      return;
    }
    setCreatingFolder(true);
    setError(null);
    try {
      await api<{ ok: true; folder: Folder }>("/api/document-folders", {
        method: "POST",
        body: JSON.stringify({
          name,
          color: newFolderColor,
          parent_folder_id: currentFolderId,
        }),
      });
      setShowFolderForm(false);
      setNewFolderName("");
      setNewFolderColor("blue");
      await loadContents(currentFolderId);
      setNotice("Carpeta creada");
    } catch (e: any) {
      setError(e?.message || "No se pudo crear la carpeta");
    } finally {
      setCreatingFolder(false);
    }
  };

  const uploadFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;

      setUploading(true);
      setError(null);
      let uploadedCount = 0;

      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        setUploadProgress(`Subiendo ${i + 1} / ${files.length}: ${file.name}`);

        const fd = new FormData();
        fd.append("file", file);
        if (currentFolderId) fd.append("folder_id", currentFolderId);
        fd.append("scope", "company");
        fd.append("category", "other");
        fd.append("title", file.name);

        try {
          const response = await fetch("/api/documents/upload", {
            method: "POST",
            body: fd,
          });
          const data = (await response.json().catch(() => ({}))) as DocumentResponse | { ok: false; error: string };
          if (!response.ok || !("ok" in data) || !data.ok) {
            const message = ("error" in data && data.error) || "Error al subir el archivo";
            throw new Error(message);
          }
          uploadedCount += 1;
        } catch (e: any) {
          setError(e?.message || `Error subiendo ${file.name}`);
          break;
        }
      }

      setUploadProgress(null);
      setUploading(false);
      await loadContents(currentFolderId);
      if (uploadedCount > 0) {
        setNotice(`${uploadedCount} archivo${uploadedCount === 1 ? "" : "s"} subido${uploadedCount === 1 ? "" : "s"}`);
      }
    },
    [currentFolderId, loadContents],
  );

  const onFileInputChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const fl = e.target.files;
    if (fl && fl.length > 0) {
      uploadFiles(fl);
    }
    e.target.value = "";
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setIsDragging(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      uploadFiles(files);
    }
  };

  const onDragEnter: React.DragEventHandler<HTMLDivElement> = (e) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  };

  const onDragLeave: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  };

  const onDragOver: React.DragEventHandler<HTMLDivElement> = (e) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const openDocument = (doc: Document) => {
    window.open(`/api/documents/${doc.id}/open`, "_blank", "noopener,noreferrer");
  };

  const deleteDocument = async (doc: Document) => {
    if (!confirm(`¿Eliminar "${doc.title}"? Esta acción se puede revertir manualmente desde la base de datos.`)) {
      return;
    }
    try {
      await api<{ ok: true }>(`/api/documents/${doc.id}/delete`, { method: "DELETE" });
      await loadContents(currentFolderId);
      setNotice("Documento eliminado");
    } catch (e: any) {
      setError(e?.message || "No se pudo eliminar el documento");
    }
  };

  const deleteFolder = async (folder: Folder) => {
    if (!confirm(`¿Eliminar la carpeta "${folder.name}"? Debe estar vacía.`)) return;
    try {
      await api<{ ok: true }>(`/api/document-folders/${folder.id}`, { method: "DELETE" });
      await loadContents(currentFolderId);
      setNotice("Carpeta eliminada");
    } catch (e: any) {
      setError(e?.message || "No se pudo eliminar la carpeta");
    }
  };

  const isEmpty = !loading && folders.length === 0 && documents.length === 0;

  const headerTitle = useMemo(() => {
    if (breadcrumb.length === 0) return "Documentos";
    return breadcrumb[breadcrumb.length - 1].name;
  }, [breadcrumb]);

  return (
    <div className="space-y-5">
      <div className="card flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <nav className="flex flex-wrap items-center gap-1 text-sm text-white/60">
            <button
              type="button"
              onClick={() => goToBreadcrumb(null)}
              className="rounded-lg px-2 py-1 font-semibold transition hover:bg-white/10 hover:text-white"
            >
              Documentos
            </button>
            {breadcrumb.map((item, idx) => (
              <span key={item.id} className="flex items-center gap-1">
                <span className="text-white/30">/</span>
                <button
                  type="button"
                  onClick={() => goToBreadcrumb(item)}
                  className={`rounded-lg px-2 py-1 font-semibold transition hover:bg-white/10 hover:text-white ${
                    idx === breadcrumb.length - 1 ? "text-white" : ""
                  }`}
                >
                  {item.name}
                </button>
              </span>
            ))}
          </nav>
          <h2 className="mt-1 truncate text-xl font-black text-white sm:text-2xl">{headerTitle}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {currentFolderId && (
            <button type="button" onClick={goUp} className="btn-secondary">
              ← Atrás
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowFolderForm((v) => !v)}
            className="btn-secondary"
          >
            + Nueva carpeta
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn-primary"
          >
            {uploading ? "Subiendo…" : "Subir archivo"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={onFileInputChange}
            className="hidden"
          />
        </div>
      </div>

      {showFolderForm && (
        <div className="card p-4 sm:p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[12rem] flex-1">
              <label className="field-label">Nombre de la carpeta</label>
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createFolder();
                  if (e.key === "Escape") {
                    setShowFolderForm(false);
                    setNewFolderName("");
                  }
                }}
                placeholder="Briefs, Facturas, Legal…"
                className="field-input mt-1"
              />
            </div>
            <div>
              <label className="field-label">Color</label>
              <div className="mt-1 flex items-center gap-2">
                {colorOptions.map((c) => {
                  const cls = colorClasses[c];
                  const active = c === newFolderColor;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewFolderColor(c)}
                      className={`h-7 w-7 rounded-full bg-gradient-to-br ${cls.gradient} ring-2 transition ${
                        active ? "ring-white" : "ring-white/0 hover:ring-white/40"
                      }`}
                      aria-label={`Color ${c}`}
                    />
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={createFolder}
                disabled={creatingFolder}
                className="btn-primary"
              >
                {creatingFolder ? "Creando…" : "Crear"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowFolderForm(false);
                  setNewFolderName("");
                }}
                className="btn-secondary"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="card border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      )}
      {notice && !error && (
        <div className="card border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          {notice}
        </div>
      )}
      {uploadProgress && (
        <div className="card p-3 text-sm text-white/80">{uploadProgress}</div>
      )}

      <div
        onDrop={onDrop}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        className={`relative card min-h-[420px] p-4 transition sm:p-6 ${
          isDragging ? "ring-2 ring-[var(--altaria-cyan)]/70 ring-offset-2 ring-offset-[#050505]" : ""
        }`}
      >
        {isDragging && (
          <div className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--altaria-cyan)]/70 bg-black/40 backdrop-blur">
            <p className="text-lg font-bold text-white">Suelta para subir aquí</p>
            <p className="mt-1 text-sm text-white/60">
              Los archivos se guardarán en {breadcrumb.length === 0 ? "la raíz" : `"${headerTitle}"`}
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex h-64 items-center justify-center text-white/50">Cargando…</div>
        ) : isEmpty ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <div className="text-5xl">📂</div>
            <p className="text-white/70">Esta carpeta está vacía</p>
            <p className="text-sm text-white/40">Arrastra archivos aquí o usa “Subir archivo”.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {folders.length > 0 && (
              <section>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-white/45">
                  Carpetas
                </h3>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {folders.map((folder) => (
                    <div key={folder.id} className="group relative">
                      <button
                        type="button"
                        onDoubleClick={() => enterFolder(folder)}
                        onClick={() => enterFolder(folder)}
                        className="flex w-full flex-col items-center gap-2 rounded-2xl p-3 transition hover:bg-white/5"
                        title={`Abrir ${folder.name}`}
                      >
                        <FolderIcon color={String(folder.color)} />
                        <span className="line-clamp-2 w-full text-center text-sm font-semibold text-white">
                          {folder.name}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteFolder(folder);
                        }}
                        className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white/80 opacity-0 transition hover:bg-rose-500 hover:text-white group-hover:opacity-100"
                        title="Eliminar carpeta"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {documents.length > 0 && (
              <section>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-white/45">
                  Archivos
                </h3>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {documents.map((doc) => {
                    const kind = fileKind(doc.mime_type, doc.original_file_name || doc.title);
                    return (
                      <div key={doc.id} className="group relative">
                        <button
                          type="button"
                          onClick={() => openDocument(doc)}
                          className="flex w-full flex-col items-center gap-2 rounded-2xl p-3 transition hover:bg-white/5"
                          title={`Abrir ${doc.title}`}
                        >
                          <FileIcon kind={kind} />
                          <span className="line-clamp-2 w-full text-center text-sm font-semibold text-white">
                            {doc.title}
                          </span>
                          <span className="text-[11px] text-white/45">
                            {formatBytes(doc.size_bytes)}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteDocument(doc);
                          }}
                          className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white/80 opacity-0 transition hover:bg-rose-500 hover:text-white group-hover:opacity-100"
                          title="Eliminar documento"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      <p className="text-center text-xs text-white/40">
        Tamaño máximo por archivo: 4 MB. Almacenamiento privado en Vercel Blob.
      </p>
    </div>
  );
}
