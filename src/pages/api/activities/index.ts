import type { APIRoute } from "astro";
import { getDb, nowIso, uuid } from "../../../lib/db";
import { badRequest, cleanString, json, optionalString, readJson, serverError } from "../../../lib/http";

type ActivityBody = { client_id?: string; contact_id?: string; type?: string; title?: string; body?: string; due_date?: string };

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await readJson<ActivityBody>(request);
    const title = cleanString(body.title);
    if (!title) return badRequest("El título de la actividad es obligatorio");
    if (!body.client_id) return badRequest("La actividad debe tener cliente");

    const db = getDb();
    const id = uuid();
    const now = nowIso();

    await db.execute({
      sql: `
        INSERT INTO activities (id, client_id, contact_id, user_id, type, title, body, due_date, completed_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
      `,
      args: [id, body.client_id, optionalString(body.contact_id), locals.user?.id || null, cleanString(body.type || "note"), title, optionalString(body.body), optionalString(body.due_date), now, now],
    });

    await db.execute({ sql: "UPDATE clients SET updated_at = ? WHERE id = ?", args: [now, body.client_id] });
    return json({ ok: true, id });
  } catch (error) {
    return serverError(error);
  }
};
