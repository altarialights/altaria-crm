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

type ClientPatchBody = {
  name?: string;
  type?: string;
  tax_id?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  country?: string;
  status?: string;
  source?: string;
  owner_user_id?: string;
  notes?: string;
  contact_status?: string;
  contacted_at?: string;
  contact_response?: string;
};

const allowedClientTypes = new Set(["company", "person"]);
const allowedClientStatuses = new Set(["lead", "active", "inactive", "lost"]);
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

function hasOwn(body: ClientPatchBody, key: keyof ClientPatchBody): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function nextOptional(
  body: ClientPatchBody,
  key: keyof ClientPatchBody,
  current: unknown,
): string | null {
  return hasOwn(body, key) ? optionalString(body[key]) : optionalString(current);
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
    const body = await readJson<ClientPatchBody>(request);

    const db = getDb();
    await ensureClientTrackingSchema(db);

    const existing = await db.execute({
      sql: "SELECT * FROM clients WHERE id = ? LIMIT 1",
      args: [id],
    });

    const current = existing.rows[0] as Record<string, unknown> | undefined;

    if (!current) {
      return notFound("Cliente no encontrado");
    }

    const name = hasOwn(body, "name")
      ? cleanString(body.name)
      : cleanString(current.name);

    if (!name) {
      return badRequest("El nombre del cliente es obligatorio");
    }

    const type = hasOwn(body, "type")
      ? cleanString(body.type || "company")
      : cleanString(current.type || "company");

    if (!allowedClientTypes.has(type)) {
      return badRequest("Tipo de cliente no válido");
    }

    const status = hasOwn(body, "status")
      ? cleanString(body.status || "lead")
      : cleanString(current.status || "lead");

    if (!allowedClientStatuses.has(status)) {
      return badRequest("Estado de cliente no válido");
    }

    const contactStatus = hasOwn(body, "contact_status")
      ? cleanString(body.contact_status || "not_contacted")
      : cleanString(current.contact_status || "not_contacted");

    if (!isAllowedContactStatus(contactStatus)) {
      return badRequest("Estado de contacto no válido");
    }

    await db.execute({
      sql: `
        UPDATE clients
        SET
          name = ?,
          type = ?,
          tax_id = ?,
          email = ?,
          phone = ?,
          website = ?,
          address = ?,
          city = ?,
          province = ?,
          postal_code = ?,
          country = ?,
          status = ?,
          source = ?,
          owner_user_id = ?,
          notes = ?,
          contact_status = ?,
          contacted_at = ?,
          contact_response = ?,
          updated_at = ?
        WHERE id = ?
      `,
      args: [
        name,
        type,
        nextOptional(body, "tax_id", current.tax_id),
        nextOptional(body, "email", current.email),
        nextOptional(body, "phone", current.phone),
        nextOptional(body, "website", current.website),
        nextOptional(body, "address", current.address),
        nextOptional(body, "city", current.city),
        nextOptional(body, "province", current.province),
        nextOptional(body, "postal_code", current.postal_code),
        nextOptional(body, "country", current.country) || "España",
        status,
        nextOptional(body, "source", current.source),
        nextOptional(body, "owner_user_id", current.owner_user_id),
        nextOptional(body, "notes", current.notes),
        contactStatus,
        nextOptional(body, "contacted_at", current.contacted_at),
        nextOptional(body, "contact_response", current.contact_response),
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

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const id = params.id || "";
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
      sql: "DELETE FROM clients WHERE id = ?",
      args: [id],
    });

    return json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
};
