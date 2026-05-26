import type { APIRoute } from "astro";
import { ensureClientTrackingSchema, getDb, nowIso } from "../../../lib/db";
import {
  badRequest,
  cleanString,
  json,
  notFound,
  optionalString,
  readJson,
  serverError,
} from "../../../lib/http";

type ContactTrackingBody = {
  contact_status?: string;
  contacted_at?: string;
  contact_response?: string;
};

const allowedContactStatuses = new Set([
  "not_contacted",
  "contacted",
  "responded",
  "no_response",
  "not_interested",
]);

function isAllowedContactStatus(value: string): boolean {
  return allowedContactStatuses.has(value);
}

export const GET: APIRoute = async ({ params }) => {
  try {
    const id = params.id || "";
    const db = getDb();
    await ensureClientTrackingSchema(db);

    const clientResult = await db.execute({
      sql: `
        SELECT c.*, u.name AS owner_name
        FROM clients c
        LEFT JOIN users u ON u.id = c.owner_user_id
        WHERE c.id = ?
        LIMIT 1
      `,
      args: [id],
    });

    const client = clientResult.rows[0] as any;
    if (!client) return notFound("Cliente no encontrado");

    const [contacts, activities, financialRecords] = await Promise.all([
      db.execute({ sql: "SELECT * FROM client_contacts WHERE client_id = ? ORDER BY is_primary DESC, created_at DESC", args: [id] }),
      db.execute({ sql: "SELECT * FROM activities WHERE client_id = ? ORDER BY created_at DESC LIMIT 30", args: [id] }),
      db.execute({ sql: "SELECT * FROM financial_records WHERE client_id = ? ORDER BY record_date DESC, created_at DESC LIMIT 50", args: [id] }),
    ]);

    client.contacts = contacts.rows;
    client.activities = activities.rows;
    client.financialRecords = financialRecords.rows;

    return json({ ok: true, client });
  } catch (error) {
    return serverError(error);
  }
};

export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    const id = params.id || "";
    const body = await readJson<ContactTrackingBody>(request);
    const contactStatus = cleanString(body.contact_status || "not_contacted");

    if (!isAllowedContactStatus(contactStatus)) {
      return badRequest("Estado de contacto no válido");
    }

    const db = getDb();
    await ensureClientTrackingSchema(db);

    const existing = await db.execute({
      sql: "SELECT id FROM clients WHERE id = ? LIMIT 1",
      args: [id],
    });

    if (!existing.rows[0]) {
      return notFound("Cliente no encontrado");
    }

    await db.execute({
      sql: `
        UPDATE clients
        SET
          contact_status = ?,
          contacted_at = ?,
          contact_response = ?,
          updated_at = ?
        WHERE id = ?
      `,
      args: [
        contactStatus,
        optionalString(body.contacted_at),
        optionalString(body.contact_response),
        nowIso(),
        id,
      ],
    });

    const clientResult = await db.execute({
      sql: `
        SELECT c.*, u.name AS owner_name
        FROM clients c
        LEFT JOIN users u ON u.id = c.owner_user_id
        WHERE c.id = ?
        LIMIT 1
      `,
      args: [id],
    });

    return json({ ok: true, client: clientResult.rows[0] });
  } catch (error) {
    return serverError(error);
  }
};
