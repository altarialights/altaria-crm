import type { APIRoute } from "astro";
import { getDb, nowIso, uuid } from "../../../lib/db";
import {
  badRequest,
  cleanString,
  intCents,
  json,
  optionalString,
  readJson,
  serverError,
} from "../../../lib/http";

type FinancialBody = {
  client_id?: string;
  kind?: string;
  concept?: string;
  amount?: string | number;
  currency?: string;
  record_date?: string;
  status?: string;
  notes?: string;
};

function getLimit(url: URL, fallback: number, max: number): number {
  const raw = Number(url.searchParams.get("limit") ?? fallback);

  if (!Number.isFinite(raw)) {
    return fallback;
  }

  return Math.max(1, Math.min(max, Math.trunc(raw)));
}

async function getFinancialTotals() {
  const db = getDb();

  const totals = await db.execute(`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_cents ELSE 0 END), 0) AS paid_cents,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_cents ELSE 0 END), 0) AS pending_cents,
      COALESCE(SUM(CASE WHEN kind IN ('income','recurring') THEN amount_cents ELSE 0 END), 0) AS income_cents,
      COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount_cents ELSE 0 END), 0) AS expense_cents
    FROM financial_records
  `);

  return (
    totals.rows[0] || {
      paid_cents: 0,
      pending_cents: 0,
      income_cents: 0,
      expense_cents: 0,
    }
  );
}

export const GET: APIRoute = async ({ url }) => {
  try {
    const db = getDb();
    const limit = getLimit(url, 200, 500);

    const [records, totals] = await Promise.all([
      db.execute({
        sql: `
          SELECT
            f.id,
            f.client_id,
            c.name AS client_name,
            f.kind,
            f.concept,
            f.amount_cents,
            f.currency,
            f.record_date,
            f.status,
            f.notes,
            f.created_at,
            f.updated_at
          FROM financial_records f
          JOIN clients c ON c.id = f.client_id
          ORDER BY f.record_date DESC, f.created_at DESC
          LIMIT ?
        `,
        args: [limit],
      }),
      getFinancialTotals(),
    ]);

    return json({
      ok: true,
      records: records.rows,
      totals,
    });
  } catch (error) {
    return serverError(error);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await readJson<FinancialBody>(request);
    const clientId = cleanString(body.client_id);
    const concept = cleanString(body.concept);

    if (!clientId) {
      return badRequest("El registro económico debe tener cliente");
    }

    if (!concept) {
      return badRequest("El concepto es obligatorio");
    }

    const db = getDb();
    const id = uuid();
    const now = nowIso();

    await db.batch(
      [
        {
          sql: `
            INSERT INTO financial_records (
              id,
              client_id,
              kind,
              concept,
              amount_cents,
              currency,
              record_date,
              status,
              notes,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            id,
            clientId,
            cleanString(body.kind || "income"),
            concept,
            intCents(body.amount),
            cleanString(body.currency || "EUR"),
            cleanString(body.record_date || new Date().toISOString().slice(0, 10)),
            cleanString(body.status || "pending"),
            optionalString(body.notes),
            now,
            now,
          ],
        },
        {
          sql: `
            UPDATE clients
            SET updated_at = ?
            WHERE id = ?
          `,
          args: [now, clientId],
        },
      ],
      "write",
    );

    const [record, totals] = await Promise.all([
      db.execute({
        sql: `
          SELECT
            f.id,
            f.client_id,
            c.name AS client_name,
            f.kind,
            f.concept,
            f.amount_cents,
            f.currency,
            f.record_date,
            f.status,
            f.notes,
            f.created_at,
            f.updated_at
          FROM financial_records f
          JOIN clients c ON c.id = f.client_id
          WHERE f.id = ?
          LIMIT 1
        `,
        args: [id],
      }),
      getFinancialTotals(),
    ]);

    return json({
      ok: true,
      id,
      record: record.rows[0],
      totals,
    });
  } catch (error) {
    return serverError(error);
  }
};