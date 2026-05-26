import type { APIRoute } from "astro";
import { getDb, nowIso, uuid } from "../../../lib/db";
import { json, serverError } from "../../../lib/http";

type BoardRow = {
  id: string;
  title: string;
};

type ColumnRow = {
  id: string;
  board_id: string;
  title: string;
  position: number;
  created_at: string;
  updated_at: string;
};

type TaskRow = {
  id: string;
  column_id: string;
  assigned_user_id: string | null;
  assigned_name: string | null;
  client_id: string | null;
  client_name: string | null;
  title: string;
  description: string | null;
  priority: string;
  due_date: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

async function ensureDefaultBoard(): Promise<BoardRow> {
  const db = getDb();

  const existing = await db.execute(`
    SELECT id, title
    FROM task_boards
    ORDER BY created_at ASC
    LIMIT 1
  `);

  if (existing.rows[0]) {
    return existing.rows[0] as BoardRow;
  }

  const boardId = uuid();
  const now = nowIso();

  const columnNames = ["Pendiente", "En progreso", "En revisión", "Hecho"];

  await db.batch(
    [
      {
        sql: `
          INSERT INTO task_boards (
            id,
            title,
            created_at,
            updated_at
          ) VALUES (?, 'General', ?, ?)
        `,
        args: [boardId, now, now],
      },
      ...columnNames.map((title, index) => ({
        sql: `
          INSERT INTO task_columns (
            id,
            board_id,
            title,
            position,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
        args: [uuid(), boardId, title, index, now, now],
      })),
    ],
    "write",
  );

  return { id: boardId, title: "General" };
}

export const GET: APIRoute = async () => {
  try {
    const db = getDb();
    const board = await ensureDefaultBoard();

    const columnsResult = await db.execute({
      sql: `
        SELECT
          id,
          board_id,
          title,
          position,
          created_at,
          updated_at
        FROM task_columns
        WHERE board_id = ?
        ORDER BY position ASC
      `,
      args: [board.id],
    });

    const columns = columnsResult.rows as unknown as ColumnRow[];

    if (columns.length === 0) {
      return json({ ok: true, board: { ...board, columns: [] } });
    }

    const columnIds = columns.map((column) => column.id);
    const placeholders = columnIds.map(() => "?").join(",");

    const tasksResult = await db.execute({
      sql: `
        SELECT
          t.id,
          t.column_id,
          t.assigned_user_id,
          u.name AS assigned_name,
          t.client_id,
          c.name AS client_name,
          t.title,
          t.description,
          t.priority,
          t.due_date,
          t.position,
          t.created_at,
          t.updated_at
        FROM tasks t
        LEFT JOIN users u ON u.id = t.assigned_user_id
        LEFT JOIN clients c ON c.id = t.client_id
        WHERE t.column_id IN (${placeholders})
        ORDER BY t.column_id ASC, t.position ASC, t.created_at DESC
      `,
      args: columnIds,
    });

    const tasksByColumn = new Map<string, TaskRow[]>();

    for (const task of tasksResult.rows as unknown as TaskRow[]) {
      const list = tasksByColumn.get(task.column_id) || [];
      list.push(task);
      tasksByColumn.set(task.column_id, list);
    }

    const columnsWithTasks = columns.map((column) => ({
      ...column,
      tasks: tasksByColumn.get(column.id) || [],
    }));

    return json({ ok: true, board: { ...board, columns: columnsWithTasks } });
  } catch (error) {
    return serverError(error);
  }
};