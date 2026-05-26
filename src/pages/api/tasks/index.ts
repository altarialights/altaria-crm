import type { APIRoute } from "astro";
import { getDb, nowIso, uuid } from "../../../lib/db";
import { badRequest, cleanString, json, optionalString, readJson, serverError } from "../../../lib/http";

type TaskBody = { column_id?: string; assigned_user_id?: string; client_id?: string; title?: string; description?: string; priority?: string; due_date?: string };

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await readJson<TaskBody>(request);
    const columnId = cleanString(body.column_id);
    const title = cleanString(body.title);
    if (!columnId) return badRequest("La tarea necesita columna");
    if (!title) return badRequest("El título de la tarea es obligatorio");

    const db = getDb();
    const id = uuid();
    const now = nowIso();
    const maxPosition = await db.execute({ sql: "SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM tasks WHERE column_id = ?", args: [columnId] });
    const nextPosition = Number((maxPosition.rows[0] as any)?.next_position || 0);

    await db.execute({
      sql: `
        INSERT INTO tasks (id, column_id, assigned_user_id, client_id, title, description, priority, due_date, position, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [id, columnId, optionalString(body.assigned_user_id), optionalString(body.client_id), title, optionalString(body.description), cleanString(body.priority || "medium"), optionalString(body.due_date), nextPosition, now, now],
    });

    return json({ ok: true, id });
  } catch (error) {
    return serverError(error);
  }
};
