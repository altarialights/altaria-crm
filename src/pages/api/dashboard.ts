import type { APIRoute } from "astro";
import { getDb } from "../../lib/db";
import { json, serverError } from "../../lib/http";

async function scalar(db: ReturnType<typeof getDb>, sql: string): Promise<number> {
  const result = await db.execute(sql);
  return Number(Object.values(result.rows[0] || { value: 0 })[0] || 0);
}

export const GET: APIRoute = async () => {
  try {
    const db = getDb();

    const [clients, opportunities, openTasks, revenueCents, pendingCents, recentClients, recentActivities, opportunitiesByStage] = await Promise.all([
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
        SELECT a.id, a.title, a.type, a.created_at, c.name AS client_name
        FROM activities a
        LEFT JOIN clients c ON c.id = a.client_id
        ORDER BY a.created_at DESC
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
      recentActivities: recentActivities.rows,
      opportunitiesByStage: opportunitiesByStage.rows,
    });
  } catch (error) {
    return serverError(error);
  }
};
