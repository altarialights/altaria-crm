import type { APIRoute } from "astro";
import { ensureUserAuthSchema, getDb } from "../../lib/db";
import { json, serverError } from "../../lib/http";

export const GET: APIRoute = async () => {
  try {
    const db = getDb();
    await ensureUserAuthSchema(db);
    const result = await db.execute(`
      SELECT id, username, name, is_active, created_at
      FROM users
      ORDER BY name ASC
    `);
    return json({ ok: true, users: result.rows });
  } catch (error) {
    return serverError(error);
  }
};
