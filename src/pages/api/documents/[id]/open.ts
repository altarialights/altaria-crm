import type { APIRoute } from "astro";
import { get } from "@vercel/blob";
import { getDb } from "../../../../lib/db";
import { json, notFound, serverError } from "../../../../lib/http";
import { getBlobToken } from "../../../../lib/blob";

function buildContentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]+/g, "_") || "archivo";
  const encoded = encodeURIComponent(fileName);
  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export const GET: APIRoute = async ({ params }) => {
  try {
    const id = params.id || "";
    const db = getDb();

    const result = await db.execute({
      sql: `
        SELECT id, blob_pathname, blob_url, blob_access, mime_type, original_file_name, status
        FROM documents
        WHERE id = ? AND status = 'active'
        LIMIT 1
      `,
      args: [id],
    });

    const doc = result.rows[0] as any;
    if (!doc) return notFound("Documento no encontrado");

    const token = getBlobToken();
    const pathname = String(doc.blob_pathname || "");

    if (!pathname) {
      return json({ ok: false, error: "Documento sin ubicación de almacenamiento." }, { status: 500 });
    }

    let blobResult;
    try {
      blobResult = await get(pathname, {
        access: "private",
        token,
        useCache: true,
      });
    } catch (e) {
      console.error("Error abriendo Vercel Blob:", e);
      return json({ ok: false, error: "No se pudo abrir el documento." }, { status: 502 });
    }

    if (!blobResult || blobResult.statusCode !== 200) {
      return notFound("Documento no disponible");
    }

    const contentType = String(blobResult.blob?.contentType || doc.mime_type || "application/octet-stream");
    const size = blobResult.blob?.size;
    const fileName = String(doc.original_file_name || "archivo");

    const headers: Record<string, string> = {
      "content-type": contentType,
      "content-disposition": buildContentDisposition(fileName),
      "cache-control": "private, no-store",
    };

    if (typeof size === "number" && Number.isFinite(size)) {
      headers["content-length"] = String(size);
    }

    return new Response(blobResult.stream, {
      status: 200,
      headers,
    });
  } catch (error) {
    return serverError(error);
  }
};
