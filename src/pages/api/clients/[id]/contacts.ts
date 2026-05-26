import type { APIRoute } from "astro";
import { getDb, nowIso, uuid } from "../../../../lib/db";
import { badRequest, cleanString, json, optionalString, readJson, serverError } from "../../../../lib/http";

type ContactBody = { full_name?: string; position?: string; email?: string; phone?: string; is_primary?: boolean; notes?: string };

export const POST: APIRoute = async ({ params, request }) => {
  try {
    const clientId = params.id || "";
    const body = await readJson<ContactBody>(request);
    const fullName = cleanString(body.full_name);
    if (!fullName) return badRequest("El nombre del contacto es obligatorio");

    const db = getDb();
    const id = uuid();
    const now = nowIso();

    await db.execute({
      sql: `
        INSERT INTO client_contacts (id, client_id, full_name, position, email, phone, is_primary, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [id, clientId, fullName, optionalString(body.position), optionalString(body.email), optionalString(body.phone), body.is_primary ? 1 : 0, optionalString(body.notes), now, now],
    });

    await db.execute({ sql: "UPDATE clients SET updated_at = ? WHERE id = ?", args: [now, clientId] });
    return json({ ok: true, id });
  } catch (error) {
    return serverError(error);
  }
};
