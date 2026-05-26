import type { APIRoute } from "astro";
import { ensureClientTrackingSchema, getDb } from "../../lib/db";
import { json, serverError } from "../../lib/http";

async function scalar(db: ReturnType<typeof getDb>, sql: string): Promise<number> {
  const result = await db.execute(sql);
  return Number(Object.values(result.rows[0] || { value: 0 })[0] || 0);
}

export const GET: APIRoute = async () => {
  try {
    const db = getDb();
    await ensureClientTrackingSchema(db);

    const [clients, opportunities, openTasks, revenueCents, pendingCents, recentClients, contactSummary, contactFollowUps, opportunitiesByStage] = await Promise.all([
      scalar(db, "SELECT COUNT(*) AS value FROM clients"),
      scalar(db, "SELECT COUNT(*) AS value FROM opportunities"),
      scalar(db, `SELECT COUNT(*) AS value FROM tasks t JOIN task_columns c ON c.id = t.column_id WHERE lower(c.title) NOT LIKE '%hecho%'`),
      scalar(db, "SELECT COALESCE(SUM(amount_cents), 0) AS value FROM financial_records WHERE status = 'paid' AND kind IN ('income','recurring')"),
      scalar(db, "SELECT COALESCE(SUM(amount_cents), 0) AS value FROM financial_records WHERE status = 'pending'"),
      db.execute(`
        SELECT id, name, status, email
        FROM clients
        ORDER BY created_at DESC
        LIMIT 5
      `),
      db.execute(`
        SELECT contact_status, COUNT(*) AS total
        FROM clients
        GROUP BY contact_status
      `),
      db.execute(`
        SELECT
          id,
          name,
          email,
          phone,
          contact_status,
          contacted_at,
          contact_response
        FROM clients
        ORDER BY
          CASE contact_status
            WHEN 'not_contacted' THEN 1
            WHEN 'contacted' THEN 2
            WHEN 'no_response' THEN 3
            WHEN 'responded' THEN 4
            WHEN 'not_interested' THEN 5
            ELSE 6
          END,
          COALESCE(contacted_at, updated_at, created_at) DESC
        LIMIT 8
      `),
      db.execute(`
        SELECT stage, COUNT(*) AS total, COALESCE(SUM(value_cents), 0) AS value_cents
        FROM opportunities
        GROUP BY stage
        ORDER BY CASE stage
          WHEN 'new' THEN 1
          WHEN 'qualified' THEN 2
          WHEN 'proposal' THEN 3
          WHEN 'won' THEN 4
          WHEN 'lost' THEN 5
          ELSE 6
        END
      `),
    ]);

    return json({
      ok: true,
      stats: { clients, opportunities, openTasks, revenueCents, pendingCents },
      recentClients: recentClients.rows,
      contactSummary: contactSummary.rows,
      contactFollowUps: contactFollowUps.rows,
      opportunitiesByStage: opportunitiesByStage.rows,
    });
  } catch (error) {
    return serverError(error);
  }
};
