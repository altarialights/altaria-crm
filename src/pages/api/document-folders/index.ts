import type { APIRoute } from "astro";
import { getDb, nowIso, uuid } from "../../../lib/db";
import {
  badRequest,
  cleanString,
  json,
  optionalString,
  readJson,
  serverError,
} from "../../../lib/http";

type FolderBody = {
  parent_folder_id?: string | null;
  name?: string;
  scope?: string;
  client_id?: string | null;
  color?: string;
  icon?: string;
};

const allowedScopes = new Set(["company", "client"]);
const allowedColors = new Set(["blue", "purple", "emerald", "amber", "rose", "slate"]);

function cleanScope(value: unknown): string {
  const v = cleanString(value || "company");
  return allowedScopes.has(v) ? v : "company";
}

function cleanColor(value: unknown): string {
  const v = cleanString(value || "blue");
  return allowedColors.has(v) ? v : "blue";
}

export const GET: APIRoute = async ({ url }) => {
  try {
    const parentIdRaw = optionalString(url.searchParams.get("parentId"));
    const db = getDb();

    const result = parentIdRaw
      ? await db.execute({
          sql: `
            SELECT id, parent_folder_id, scope, client_id, name, color, icon, position, created_at, updated_at
            FROM document_folders
            WHERE parent_folder_id = ?
            ORDER BY position ASC, name ASC
          `,
          args: [parentIdRaw],
        })
      : await db.execute({
          sql: `
            SELECT id, parent_folder_id, scope, client_id, name, color, icon, position, created_at, updated_at
            FROM document_folders
            WHERE parent_folder_id IS NULL
            ORDER BY position ASC, name ASC
          `,
        });

    return json({ ok: true, folders: result.rows });
  } catch (error) {
    return serverError(error);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await readJson<FolderBody>(request);
    const name = cleanString(body.name);

    if (!name) {
      return badRequest("El nombre de la carpeta es obligatorio");
    }

    const parentFolderId = optionalString(body.parent_folder_id);
    const scope = cleanScope(body.scope);
    const clientId = optionalString(body.client_id);
    const color = cleanColor(body.color);
    const icon = cleanString(body.icon) || "folder";

    const id = uuid();
    const now = nowIso();
    const db = getDb();

    try {
      await db.execute({
        sql: `
          INSERT INTO document_folders (
            id,
            parent_folder_id,
            scope,
            client_id,
            name,
            color,
            icon,
            position,
            created_by_user_id,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          id,
          parentFolderId,
          scope,
          clientId,
          name,
          color,
          icon,
          0,
          locals.user?.id || null,
          now,
          now,
        ],
      });
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.toLowerCase().includes("unique")) {
        return badRequest("Ya existe una carpeta con ese nombre en esta ubicación");
      }
      throw e;
    }

    const result = await db.execute({
      sql: `
        SELECT id, parent_folder_id, scope, client_id, name, color, icon, position, created_at, updated_at
        FROM document_folders
        WHERE id = ?
        LIMIT 1
      `,
      args: [id],
    });

    return json({ ok: true, folder: result.rows[0] });
  } catch (error) {
    return serverError(error);
  }
};
