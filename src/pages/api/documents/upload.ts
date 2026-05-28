import type { APIRoute } from "astro";
import { put } from "@vercel/blob";
import { getDb, nowIso, uuid } from "../../../lib/db";
import { badRequest, cleanString, json, optionalString, serverError } from "../../../lib/http";
import { getBlobToken, safeFileName } from "../../../lib/blob";

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const allowedScopes = new Set(["company", "client"]);

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return badRequest("Cuerpo inválido. Se esperaba multipart/form-data.");
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return badRequest("Falta el archivo en el campo 'file'.");
    }

    if (file.size <= 0) {
      return badRequest("El archivo está vacío.");
    }

    if (file.size > MAX_BYTES) {
      return badRequest("Archivo demasiado grande. Máximo 4 MB en esta versión.");
    }

    const folderId = optionalString(form.get("folder_id"));
    const scopeRaw = cleanString(form.get("scope") || "company");
    const scope = allowedScopes.has(scopeRaw) ? scopeRaw : "company";
    const clientId = optionalString(form.get("client_id"));
    const category = cleanString(form.get("category") || "other") || "other";
    const description = optionalString(form.get("description"));
    const titleFromForm = optionalString(form.get("title"));

    const originalName = cleanString(file.name) || "archivo";
    const safe = safeFileName(originalName);
    const id = uuid();
    const folderSegment = folderId || "root";
    const pathname = `documents/${folderSegment}/${id}-${safe}`;

    const token = getBlobToken();

    let putResult;
    try {
      putResult = await put(pathname, file, {
        access: "private",
        token,
        contentType: file.type || "application/octet-stream",
        addRandomSuffix: false,
        allowOverwrite: false,
      });
    } catch (e: any) {
      console.error("Error subiendo a Vercel Blob:", e);
      return json(
        { ok: false, error: "No se pudo subir el archivo al almacenamiento." },
        { status: 502 },
      );
    }

    const now = nowIso();
    const title = titleFromForm || originalName;
    const mime = file.type || (putResult as any).contentType || null;

    const db = getDb();
    await db.execute({
      sql: `
        INSERT INTO documents (
          id,
          folder_id,
          scope,
          client_id,
          title,
          description,
          category,
          provider,
          blob_access,
          blob_url,
          blob_pathname,
          original_file_name,
          stored_file_name,
          mime_type,
          size_bytes,
          status,
          uploaded_by_user_id,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        id,
        folderId,
        scope,
        clientId,
        title,
        description,
        category,
        "vercel_blob",
        "private",
        putResult.url,
        putResult.pathname,
        originalName,
        safe,
        mime,
        file.size,
        "active",
        locals.user?.id || null,
        now,
        now,
      ],
    });

    const result = await db.execute({
      sql: `
        SELECT
          id, folder_id, scope, client_id, title, description, category,
          provider, blob_access, blob_pathname, original_file_name,
          stored_file_name, mime_type, size_bytes, status,
          uploaded_by_user_id, created_at, updated_at
        FROM documents
        WHERE id = ?
        LIMIT 1
      `,
      args: [id],
    });

    return json({ ok: true, document: result.rows[0] });
  } catch (error) {
    return serverError(error);
  }
};
