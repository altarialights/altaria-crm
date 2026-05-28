import type { APIRoute } from "astro";
import { getDb, nowIso } from "../../../../lib/db";
import { json, notFound, serverError } from "../../../../lib/http";

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const id = params.id || "";
    const db = getDb();

    const existing = await db.execute({
      sql: "SELECT id FROM documents WHERE id = ? AND status = 'active' LIMIT 1",
      args: [id],
    });

    if (!existing.rows[0]) return notFound("Documento no encontrado");

    const now = nowIso();
    await db.execute({
      sql: `
        UPDATE documents
        SET status = 'deleted', deleted_at = ?, updated_at = ?
        WHERE id = ?
      `,
      args: [now, now, id],
    });

    return json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
};
