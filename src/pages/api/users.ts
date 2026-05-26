import type { APIRoute } from "astro";
import { getDb } from "../../lib/db";
import { json, serverError } from "../../lib/http";

export const GET: APIRoute = async () => {
  try {
    const db = getDb();
    const result = await db.execute(`
      SELECT id, email, name, role, is_active, created_at
      FROM users
      ORDER BY name ASC
    `);
    return json({ ok: true, users: result.rows });
  } catch (error) {
    return serverError(error);
  }
};
