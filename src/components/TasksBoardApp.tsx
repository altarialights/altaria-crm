import { useEffect, useMemo, useState } from "react";
import { api } from "./api";

type User = { id: string; name: string; username: string };
type Client = { id: string; name: string };

type Task = {
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
};

type Column = {
  id: string;
  title: string;
  position: number;
  tasks: Task[];
};

type BoardResponse = {
  ok: true;
  board: {
    id: string;
    title: string;
    columns: Column[];
  };
};

type UsersResponse = { ok: true; users: User[] };
type ClientsResponse = { ok: true; clients: Client[] };

export default function TasksBoardApp() {
  const [columns, setColumns] = useState<Column[]>([]);
  const [boardId, setBoardId] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState("");
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [movingTaskIds, setMovingTaskIds] = useState<Set<string>>(new Set());

  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "medium",
    due_date: "",
    assigned_user_id: "",
    client_id: "",
    column_id: "",
  });

  const firstColumnId = useMemo(() => columns[0]?.id || "", [columns]);

  async function loadBoard() {
    const board = await api<BoardResponse>("/api/tasks/board");

    setBoardId(board.board.id);
    setColumns(board.board.columns);

    if (!form.column_id && board.board.columns[0]) {
      setForm((prev) => ({
        ...prev,
        column_id: board.board.columns[0].id,
      }));
    }
  }

  async function loadStaticOptions() {
    const [usersData, clientsData] = await Promise.all([
      api<UsersResponse>("/api/users"),
      api<ClientsResponse>("/api/clients?mode=options&limit=1000"),
    ]);

    setUsers(usersData.users);
    setClients(clientsData.clients);
  }

  useEffect(() => {
    Promise.all([loadBoard(), loadStaticOptions()]).catch((err) => {
      setError(err instanceof Error ? err.message : "Error cargando tareas");
    });
  }, []);

  async function createTask(event: React.FormEvent) {
    event.preventDefault();

    setError("");

    try {
      await api("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          column_id: form.column_id || firstColumnId,
        }),
      });

      setForm({
        title: "",
        description: "",
        priority: "medium",
        due_date: "",
        assigned_user_id: "",
        client_id: "",
        column_id: form.column_id || firstColumnId,
      });

      await loadBoard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando tarea");
    }
  }

  function markTaskAsMoving(taskId: string) {
    setMovingTaskIds((current) => {
      const next = new Set(current);
      next.add(taskId);
      return next;
    });
  }

  function unmarkTaskAsMoving(taskId: string) {
    setMovingTaskIds((current) => {
      const next = new Set(current);
      next.delete(taskId);
      return next;
    });
  }

  function moveTaskOptimistic(taskId: string, targetColumnId: string) {
    setError("");

    const sourceColumn = columns.find((column) =>
      column.tasks.some((task) => task.id === taskId),
    );

    if (!sourceColumn) {
      return;
    }

    if (sourceColumn.id === targetColumnId) {
      return;
    }

    const targetColumn = columns.find((column) => column.id === targetColumnId);

    if (!targetColumn) {
      return;
    }

    const taskToMove = sourceColumn.tasks.find((task) => task.id === taskId);

    if (!taskToMove) {
      return;
    }

    const previousColumns = columns;

    const nextColumns = columns.map((column) => {
      if (column.id === sourceColumn.id) {
        return {
          ...column,
          tasks: column.tasks.filter((task) => task.id !== taskId),
        };
      }

      if (column.id === targetColumnId) {
        return {
          ...column,
          tasks: [
            ...column.tasks,
            {
              ...taskToMove,
              column_id: targetColumnId,
              position: column.tasks.length,
            },
          ],
        };
      }

      return column;
    });

    // UI instantánea: se pinta antes de esperar al backend.
    setColumns(nextColumns);
    markTaskAsMoving(taskId);

    // Backend en segundo plano. Si falla, revertimos.
    void api(`/api/tasks/${taskId}/move`, {
      method: "POST",
      body: JSON.stringify({ column_id: targetColumnId }),
    })
      .catch((err) => {
        setColumns(previousColumns);
        setError(err instanceof Error ? err.message : "Error moviendo tarea");
      })
      .finally(() => {
        unmarkTaskAsMoving(taskId);
      });
  }

  function toggleDone(task: Task) {
    const done = columns.find((column) =>
      column.title.toLowerCase().includes("hecho"),
    );

    const todo = columns[0];

    if (!todo) {
      return;
    }

    moveTaskOptimistic(
      task.id,
      task.column_id === done?.id ? todo.id : done?.id || task.column_id,
    );
  }

  return (
    <div className="space-y-6">
      <section className="card p-4 sm:p-5">
        <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-black text-slate-950">Nueva tarea</h2>
            <p className="mt-1 text-sm text-slate-500">
              Tablero estilo Trello con asignación por usuario.
            </p>
          </div>

          {boardId ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
              Board activo
            </span>
          ) : null}
        </div>

        {error ? (
          <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        <form
          onSubmit={createTask}
          className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_160px_160px_160px_auto]"
        >
          <input
            className="field-input"
            placeholder="Título"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            required
          />

          <input
            className="field-input"
            placeholder="Descripción"
            value={form.description}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
          />

          <select
            className="field-input"
            value={form.assigned_user_id}
            onChange={(event) =>
              setForm({ ...form, assigned_user_id: event.target.value })
            }
          >
            <option value="">Sin usuario</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>

          <select
            className="field-input"
            value={form.client_id}
            onChange={(event) => setForm({ ...form, client_id: event.target.value })}
          >
            <option value="">Sin cliente</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>

          <select
            className="field-input"
            value={form.priority}
            onChange={(event) => setForm({ ...form, priority: event.target.value })}
          >
            <option value="low">Baja</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
            <option value="urgent">Urgente</option>
          </select>

          <button className="btn-primary lg:col-span-2 2xl:col-span-1">Crear</button>
        </form>
      </section>

      <section className="grid auto-cols-[minmax(280px,85vw)] grid-flow-col gap-4 overflow-x-auto pb-2 xl:auto-cols-auto xl:grid-flow-row xl:grid-cols-4 xl:overflow-visible xl:pb-0">
        {columns.map((column) => (
          <div
            key={column.id}
            className={`card min-h-[420px] bg-slate-100/60 p-4 transition sm:min-h-[500px] xl:min-h-[620px] ${dragTaskId ? "ring-2 ring-slate-200" : ""
              }`}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={() => {
              if (dragTaskId) {
                moveTaskOptimistic(dragTaskId, column.id);
              }

              setDragTaskId(null);
            }}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="min-w-0 truncate font-black text-slate-950">{column.title}</h3>
              <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-500 ring-1 ring-slate-200">
                {column.tasks.length}
              </span>
            </div>

            <div className="space-y-3">
              {column.tasks.map((task) => {
                const isMoving = movingTaskIds.has(task.id);

                return (
                  <article
                    key={task.id}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      setDragTaskId(task.id);
                    }}
                    onDragEnd={() => setDragTaskId(null)}
                    className={`cursor-grab rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition active:cursor-grabbing sm:p-4 ${isMoving ? "opacity-70" : "opacity-100"
                      }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 break-words font-black text-slate-950">{task.title}</p>

                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase ${task.priority === "urgent" || task.priority === "high"
                            ? "bg-red-50 text-red-700"
                            : "bg-slate-100 text-slate-500"
                          }`}
                      >
                        {task.priority}
                      </span>
                    </div>

                    {task.description ? (
                      <p className="mt-2 break-words text-sm text-slate-600">
                        {task.description}
                      </p>
                    ) : null}

                    <div className="mt-4 space-y-1 text-xs text-slate-500">
                      <p>
                        Usuario:{" "}
                        <strong className="text-slate-700">
                          {task.assigned_name || "Sin asignar"}
                        </strong>
                      </p>

                      <p>
                        Cliente:{" "}
                        <strong className="text-slate-700">
                          {task.client_name || "Sin cliente"}
                        </strong>
                      </p>

                      {task.due_date ? <p>Fecha: {task.due_date}</p> : null}
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleDone(task)}
                      className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                    >
                      Cambiar estado
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
