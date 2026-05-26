import type { APIRoute } from "astro";
import { getDb, nowIso } from "../../../../lib/db";
import { badRequest, cleanString, json, readJson, serverError } from "../../../../lib/http";

type MoveBody = { column_id?: string };

export const POST: APIRoute = async ({ params, request }) => {
  try {
    const taskId = params.id || "";
    const body = await readJson<MoveBody>(request);
    const columnId = cleanString(body.column_id);
    if (!taskId || !columnId) return badRequest("Falta tarea o columna");

    const db = getDb();
    const maxPosition = await db.execute({ sql: "SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM tasks WHERE column_id = ?", args: [columnId] });
    const nextPosition = Number((maxPosition.rows[0] as any)?.next_position || 0);

    await db.execute({
      sql: "UPDATE tasks SET column_id = ?, position = ?, updated_at = ? WHERE id = ?",
      args: [columnId, nextPosition, nowIso(), taskId],
    });

    return json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
};
