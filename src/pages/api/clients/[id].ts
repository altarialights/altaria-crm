import type { APIRoute } from "astro";
import { getDb } from "../../../lib/db";
import { json, notFound, serverError } from "../../../lib/http";

export const GET: APIRoute = async ({ params }) => {
  try {
    const id = params.id || "";
    const db = getDb();

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
