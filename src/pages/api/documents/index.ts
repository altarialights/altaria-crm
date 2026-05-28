import type { APIRoute } from "astro";
import { getDb } from "../../../lib/db";
import { json, optionalString, serverError } from "../../../lib/http";

export const GET: APIRoute = async ({ url }) => {
  try {
    const folderIdRaw = optionalString(url.searchParams.get("folderId"));
    const db = getDb();

    const result = folderIdRaw
      ? await db.execute({
          sql: `
            SELECT
              id, folder_id, scope, client_id, title, description, category,
              provider, blob_access, blob_pathname, original_file_name,
              stored_file_name, mime_type, size_bytes, status,
              uploaded_by_user_id, created_at, updated_at
            FROM documents
            WHERE folder_id = ? AND status = 'active'
            ORDER BY created_at DESC
          `,
          args: [folderIdRaw],
        })
      : await db.execute({
          sql: `
            SELECT
              id, folder_id, scope, client_id, title, description, category,
              provider, blob_access, blob_pathname, original_file_name,
              stored_file_name, mime_type, size_bytes, status,
              uploaded_by_user_id, created_at, updated_at
            FROM documents
            WHERE folder_id IS NULL AND status = 'active'
            ORDER BY created_at DESC
          `,
        });

    return json({ ok: true, documents: result.rows });
  } catch (error) {
    return serverError(error);
  }
};
