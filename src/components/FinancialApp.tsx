import { useEffect, useState } from "react";
import { api, formatMoney } from "./api";

type Client = { id: string; name: string };

type FinancialRecord = {
  id: string;
  client_id?: string;
  client_name: string;
  kind: string;
  concept: string;
  amount_cents: number;
  currency: string;
  record_date: string;
  status: string;
  notes: string | null;
};

type FinancialTotals = {
  paid_cents: number;
  pending_cents: number;
  income_cents: number;
  expense_cents: number;
};

type ResponseData = {
  ok: true;
  records: FinancialRecord[];
  totals: FinancialTotals;
};

type ClientsResponse = { ok: true; clients: Client[] };

type CreateFinancialResponse = {
  ok: true;
  id: string;
  record?: FinancialRecord;
  totals?: FinancialTotals;
};

const emptyTotals: FinancialTotals = {
  paid_cents: 0,
  pending_cents: 0,
  income_cents: 0,
  expense_cents: 0,
};

export default function FinancialApp() {
  const [records, setRecords] = useState<FinancialRecord[]>([]);
  const [totals, setTotals] = useState<FinancialTotals>(emptyTotals);
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    client_id: "",
    kind: "income",
    concept: "",
    amount: "",
    record_date: new Date().toISOString().slice(0, 10),
    status: "pending",
    notes: "",
  });

  async function loadFinancial() {
    const financial = await api<ResponseData>("/api/financial?limit=200");

    setRecords(financial.records);
    setTotals(financial.totals);
  }

  async function loadClientOptions() {
    const clientsData = await api<ClientsResponse>(
      "/api/clients?mode=options&limit=1000",
    );

    setClients(clientsData.clients);

    if (!form.client_id && clientsData.clients[0]) {
      setForm((prev) => ({
        ...prev,
        client_id: clientsData.clients[0].id,
      }));
    }
  }

  useEffect(() => {
    Promise.all([loadFinancial(), loadClientOptions()]).catch((err) => {
      setError(err instanceof Error ? err.message : "Error cargando economía");
    });
  }, []);

  async function createRecord(event: React.FormEvent) {
    event.preventDefault();

    setError("");

    try {
      const data = await api<CreateFinancialResponse>("/api/financial", {
        method: "POST",
        body: JSON.stringify(form),
      });

      if (data.record) {
        setRecords((current) => [data.record!, ...current].slice(0, 200));
      } else {
        await loadFinancial();
      }

      if (data.totals) {
        setTotals(data.totals);
      }

      setForm({
        client_id: clients[0]?.id || "",
        kind: "income",
        concept: "",
        amount: "",
        record_date: new Date().toISOString().slice(0, 10),
        status: "pending",
        notes: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando registro");
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card p-4 sm:p-5">
          <p className="text-sm font-bold text-slate-500">Ingresos</p>
          <p className="mt-2 text-2xl font-black">
            {formatMoney(totals.income_cents)}
          </p>
        </div>

        <div className="card p-4 sm:p-5">
          <p className="text-sm font-bold text-slate-500">Gastos</p>
          <p className="mt-2 text-2xl font-black">
            {formatMoney(totals.expense_cents)}
          </p>
        </div>

        <div className="card p-4 sm:p-5">
          <p className="text-sm font-bold text-slate-500">Pagado</p>
          <p className="mt-2 text-2xl font-black">
            {formatMoney(totals.paid_cents)}
          </p>
        </div>

        <div className="card p-4 sm:p-5">
          <p className="text-sm font-bold text-slate-500">Pendiente</p>
          <p className="mt-2 text-2xl font-black">
            {formatMoney(totals.pending_cents)}
          </p>
        </div>
      </div>

      <section className="card p-4 sm:p-5">
        <h2 className="mb-4 text-lg font-black text-slate-950">
          Nuevo registro económico
        </h2>

        {error ? (
          <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        <form
          onSubmit={createRecord}
          className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_130px_140px_140px_140px_auto]"
        >
          <select
            className="field-input"
            value={form.client_id}
            onChange={(event) => setForm({ ...form, client_id: event.target.value })}
            required
          >
            <option value="">Cliente</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>

          <input
            className="field-input"
            placeholder="Concepto"
            value={form.concept}
            onChange={(event) => setForm({ ...form, concept: event.target.value })}
            required
          />

          <input
            className="field-input"
            type="number"
            step="0.01"
            placeholder="Importe"
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
            required
          />

          <select
            className="field-input"
            value={form.kind}
            onChange={(event) => setForm({ ...form, kind: event.target.value })}
          >
            <option value="income">Ingreso</option>
            <option value="expense">Gasto</option>
            <option value="budget">Presupuesto</option>
            <option value="recurring">Recurrente</option>
          </select>

          <select
            className="field-input"
            value={form.status}
            onChange={(event) => setForm({ ...form, status: event.target.value })}
          >
            <option value="pending">Pendiente</option>
            <option value="paid">Pagado</option>
            <option value="cancelled">Cancelado</option>
          </select>

          <input
            className="field-input"
            type="date"
            value={form.record_date}
            onChange={(event) =>
              setForm({ ...form, record_date: event.target.value })
            }
          />

          <button className="btn-primary xl:col-span-2 2xl:col-span-1">Añadir</button>
        </form>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <h2 className="text-lg font-black text-slate-950">Registros</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="p-4">Cliente</th>
                <th className="p-4">Concepto</th>
                <th className="p-4">Tipo</th>
                <th className="p-4">Fecha</th>
                <th className="p-4">Estado</th>
                <th className="p-4 text-right">Importe</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {records.map((record) => (
                <tr key={record.id}>
                  <td className="p-4 font-bold">{record.client_name}</td>
                  <td className="p-4">{record.concept}</td>
                  <td className="p-4 text-slate-500">{record.kind}</td>
                  <td className="p-4 text-slate-500">{record.record_date}</td>
                  <td className="p-4 text-slate-500">{record.status}</td>
                  <td className="p-4 text-right font-black">
                    {formatMoney(record.amount_cents, record.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
