import type { APIRoute } from "astro";
import { getDb, nowIso } from "../../../lib/db";
import {
  badRequest,
  cleanString,
  json,
  notFound,
  readJson,
  serverError,
} from "../../../lib/http";

type FolderPatchBody = {
  name?: string;
  color?: string;
};

const allowedColors = new Set(["blue", "purple", "emerald", "amber", "rose", "slate"]);

function buildBreadcrumb(rows: Array<{ id: string; name: string; parent_folder_id: string | null }>, startId: string) {
  const map = new Map(rows.map((r) => [r.id, r]));
  const chain: Array<{ id: string; name: string }> = [];
  let current = map.get(startId);
  let safety = 0;
  while (current && safety < 50) {
    chain.unshift({ id: current.id, name: current.name });
    if (!current.parent_folder_id) break;
    current = map.get(current.parent_folder_id);
    safety += 1;
  }
  return chain;
}

export const GET: APIRoute = async ({ params }) => {
  try {
    const id = params.id || "";
    const db = getDb();

    const result = await db.execute({
      sql: `
        SELECT id, parent_folder_id, scope, client_id, name, color, icon, position, created_at, updated_at
        FROM document_folders
        WHERE id = ?
        LIMIT 1
      `,
      args: [id],
    });

    const folder = result.rows[0];
    if (!folder) return notFound("Carpeta no encontrada");

    const all = await db.execute({
      sql: "SELECT id, name, parent_folder_id FROM document_folders",
    });

    const breadcrumb = buildBreadcrumb(all.rows as any, id);

    return json({ ok: true, folder, breadcrumb });
  } catch (error) {
    return serverError(error);
  }
};

export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    const id = params.id || "";
    const body = await readJson<FolderPatchBody>(request);

    const db = getDb();
    const existing = await db.execute({
      sql: "SELECT * FROM document_folders WHERE id = ? LIMIT 1",
      args: [id],
    });

    const current = existing.rows[0] as Record<string, unknown> | undefined;
    if (!current) return notFound("Carpeta no encontrada");

    const name = Object.prototype.hasOwnProperty.call(body, "name")
      ? cleanString(body.name)
      : cleanString(current.name);

    if (!name) return badRequest("El nombre de la carpeta es obligatorio");

    const colorRaw = Object.prototype.hasOwnProperty.call(body, "color")
      ? cleanString(body.color || "blue")
      : cleanString(current.color || "blue");
    const color = allowedColors.has(colorRaw) ? colorRaw : "blue";

    try {
      await db.execute({
        sql: `
          UPDATE document_folders
          SET name = ?, color = ?, updated_at = ?
          WHERE id = ?
        `,
        args: [name, color, nowIso(), id],
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

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const id = params.id || "";
    const db = getDb();

    const existing = await db.execute({
      sql: "SELECT id FROM document_folders WHERE id = ? LIMIT 1",
      args: [id],
    });

    if (!existing.rows[0]) return notFound("Carpeta no encontrada");

    const childFolders = await db.execute({
      sql: "SELECT COUNT(*) AS c FROM document_folders WHERE parent_folder_id = ?",
      args: [id],
    });

    const childDocs = await db.execute({
      sql: "SELECT COUNT(*) AS c FROM documents WHERE folder_id = ? AND status = 'active'",
      args: [id],
    });

    const folderCount = Number((childFolders.rows[0] as any)?.c || 0);
    const docsCount = Number((childDocs.rows[0] as any)?.c || 0);

    if (folderCount > 0 || docsCount > 0) {
      return badRequest(
        "La carpeta no está vacía. Mueve o elimina su contenido antes de borrarla.",
      );
    }

    await db.execute({
      sql: "DELETE FROM document_folders WHERE id = ?",
      args: [id],
    });

    return json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
};
