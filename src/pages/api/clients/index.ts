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

type ClientBody = {
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
};

function getLimit(url: URL, fallback: number, max: number): number {
  const raw = Number(url.searchParams.get("limit") ?? fallback);

  if (!Number.isFinite(raw)) {
    return fallback;
  }

  return Math.max(1, Math.min(max, Math.trunc(raw)));
}

export const GET: APIRoute = async ({ url }) => {
  try {
    const q = cleanString(url.searchParams.get("q")).toLowerCase();
    const mode = cleanString(url.searchParams.get("mode")).toLowerCase();
    const db = getDb();

    if (mode === "options") {
      const limit = getLimit(url, 500, 2000);

      const result = await db.execute({
        sql: `
          SELECT
            c.id,
            c.name
          FROM clients c
          WHERE ? = ''
             OR lower(c.name) LIKE '%' || ? || '%'
             OR lower(COALESCE(c.email, '')) LIKE '%' || ? || '%'
             OR lower(COALESCE(c.tax_id, '')) LIKE '%' || ? || '%'
          ORDER BY c.name ASC
          LIMIT ?
        `,
        args: [q, q, q, q, limit],
      });

      return json({ ok: true, clients: result.rows });
    }

    const limit = getLimit(url, 100, 500);

    const result = await db.execute({
      sql: `
        SELECT
          c.id,
          c.name,
          c.type,
          c.tax_id,
          c.email,
          c.phone,
          c.website,
          c.address,
          c.city,
          c.province,
          c.postal_code,
          c.country,
          c.status,
          c.source,
          c.owner_user_id,
          c.notes,
          c.created_at,
          c.updated_at,
          u.name AS owner_name
        FROM clients c
        LEFT JOIN users u ON u.id = c.owner_user_id
        WHERE ? = ''
           OR lower(c.name) LIKE '%' || ? || '%'
           OR lower(COALESCE(c.email, '')) LIKE '%' || ? || '%'
           OR lower(COALESCE(c.tax_id, '')) LIKE '%' || ? || '%'
        ORDER BY c.updated_at DESC, c.created_at DESC
        LIMIT ?
      `,
      args: [q, q, q, q, limit],
    });

    return json({ ok: true, clients: result.rows });
  } catch (error) {
    return serverError(error);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await readJson<ClientBody>(request);
    const name = cleanString(body.name);

    if (!name) {
      return badRequest("El nombre del cliente es obligatorio");
    }

    const id = uuid();
    const now = nowIso();
    const db = getDb();
    const ownerUserId = optionalString(body.owner_user_id) || locals.user?.id || null;

    await db.execute({
      sql: `
        INSERT INTO clients (
          id,
          name,
          type,
          tax_id,
          email,
          phone,
          website,
          address,
          city,
          province,
          postal_code,
          country,
          status,
          source,
          owner_user_id,
          notes,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        id,
        name,
        cleanString(body.type || "company"),
        optionalString(body.tax_id),
        optionalString(body.email),
        optionalString(body.phone),
        optionalString(body.website),
        optionalString(body.address),
        optionalString(body.city),
        optionalString(body.province),
        optionalString(body.postal_code),
        optionalString(body.country) || "España",
        cleanString(body.status || "lead"),
        optionalString(body.source),
        ownerUserId,
        optionalString(body.notes),
        now,
        now,
      ],
    });

    const result = await db.execute({
      sql: `
        SELECT
          c.id,
          c.name,
          c.type,
          c.tax_id,
          c.email,
          c.phone,
          c.website,
          c.address,
          c.city,
          c.province,
          c.postal_code,
          c.country,
          c.status,
          c.source,
          c.owner_user_id,
          c.notes,
          c.created_at,
          c.updated_at,
          u.name AS owner_name
        FROM clients c
        LEFT JOIN users u ON u.id = c.owner_user_id
        WHERE c.id = ?
        LIMIT 1
      `,
      args: [id],
    });

    return json({ ok: true, client: result.rows[0] });
  } catch (error) {
    return serverError(error);
  }
};