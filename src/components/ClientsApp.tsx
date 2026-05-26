import { useEffect, useMemo, useState } from "react";
import { api, formatMoney } from "./api";

type User = { id: string; name: string; email: string; role: string };

type Contact = {
  id: string;
  full_name: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  is_primary: number;
  notes: string | null;
};

type Activity = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
};

type FinancialRecord = {
  id: string;
  kind: string;
  concept: string;
  amount_cents: number;
  currency: string;
  record_date: string;
  status: string;
  notes: string | null;
};

type Client = {
  id: string;
  name: string;
  type: string;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  status: string;
  source: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at?: string;
  contacts?: Contact[];
  activities?: Activity[];
  financialRecords?: FinancialRecord[];
};

type ClientsResponse = { ok: true; clients: Client[] };
type UsersResponse = { ok: true; users: User[] };
type ClientDetailResponse = { ok: true; client: Client };

const emptyClient = {
  name: "",
  type: "company",
  tax_id: "",
  email: "",
  phone: "",
  website: "",
  address: "",
  city: "",
  province: "",
  postal_code: "",
  country: "España",
  status: "lead",
  source: "",
  owner_user_id: "",
  notes: "",
};

export default function ClientsApp() {
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [selected, setSelected] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyClient);
  const [contactForm, setContactForm] = useState({
    full_name: "",
    position: "",
    email: "",
    phone: "",
    is_primary: false,
    notes: "",
  });
  const [activityForm, setActivityForm] = useState({
    type: "call",
    title: "",
    body: "",
    due_date: "",
  });
  const [financialForm, setFinancialForm] = useState({
    kind: "income",
    concept: "",
    amount: "",
    record_date: new Date().toISOString().slice(0, 10),
    status: "pending",
    notes: "",
  });
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadClients(search: string) {
    const data = await api<ClientsResponse>(
      `/api/clients?q=${encodeURIComponent(search)}&limit=100`,
    );

    setClients(data.clients);

    setSelectedId((currentSelectedId) => {
      if (currentSelectedId && data.clients.some((client) => client.id === currentSelectedId)) {
        return currentSelectedId;
      }

      return data.clients[0]?.id || "";
    });
  }

  async function loadUsers() {
    const data = await api<UsersResponse>("/api/users");
    setUsers(data.users);
  }

  async function loadSelected(id: string) {
    if (!id) {
      setSelected(null);
      return;
    }

    const data = await api<ClientDetailResponse>(`/api/clients/${id}`);
    setSelected(data.client);
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [query]);

  useEffect(() => {
    loadUsers().catch((err) => {
      setError(err instanceof Error ? err.message : "Error cargando usuarios");
    });
  }, []);

  useEffect(() => {
    loadClients(debouncedQuery).catch((err) => {
      setError(err instanceof Error ? err.message : "Error cargando clientes");
    });
  }, [debouncedQuery]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }

    loadSelected(selectedId).catch((err) => {
      setError(err instanceof Error ? err.message : "Error cargando cliente");
    });
  }, [selectedId]);

  const totals = useMemo(() => {
    const records = selected?.financialRecords || [];
    const paid = records
      .filter((record) => record.status === "paid")
      .reduce((sum, record) => sum + record.amount_cents, 0);
    const pending = records
      .filter((record) => record.status === "pending")
      .reduce((sum, record) => sum + record.amount_cents, 0);

    return { paid, pending };
  }, [selected]);

  async function createClient(event: React.FormEvent) {
    event.preventDefault();

    setSaving(true);
    setError("");

    try {
      const data = await api<{ ok: true; client: Client }>("/api/clients", {
        method: "POST",
        body: JSON.stringify(form),
      });

      setForm(emptyClient);
      setClients((currentClients) => [
        data.client,
        ...currentClients.filter((client) => client.id !== data.client.id),
      ]);
      setSelectedId(data.client.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando cliente");
    } finally {
      setSaving(false);
    }
  }

  async function addContact(event: React.FormEvent) {
    event.preventDefault();

    if (!selected) return;

    try {
      await api(`/api/clients/${selected.id}/contacts`, {
        method: "POST",
        body: JSON.stringify(contactForm),
      });

      setContactForm({
        full_name: "",
        position: "",
        email: "",
        phone: "",
        is_primary: false,
        notes: "",
      });

      await loadSelected(selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error añadiendo contacto");
    }
  }

  async function addActivity(event: React.FormEvent) {
    event.preventDefault();

    if (!selected) return;

    try {
      await api("/api/activities", {
        method: "POST",
        body: JSON.stringify({ ...activityForm, client_id: selected.id }),
      });

      setActivityForm({
        type: "call",
        title: "",
        body: "",
        due_date: "",
      });

      await loadSelected(selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error añadiendo actividad");
    }
  }

  async function addFinancial(event: React.FormEvent) {
    event.preventDefault();

    if (!selected) return;

    try {
      await api("/api/financial", {
        method: "POST",
        body: JSON.stringify({ ...financialForm, client_id: selected.id }),
      });

      setFinancialForm({
        kind: "income",
        concept: "",
        amount: "",
        record_date: new Date().toISOString().slice(0, 10),
        status: "pending",
        notes: "",
      });

      await loadSelected(selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error añadiendo registro económico");
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <section className="space-y-4">
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-black text-slate-950">Nuevo cliente</h2>
          </div>

          {error ? (
            <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {error}
            </div>
          ) : null}

          <form className="grid gap-3" onSubmit={createClient}>
            <label className="space-y-1">
              <span className="field-label">Nombre *</span>
              <input
                className="field-input"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="field-label">Tipo</span>
                <select
                  className="field-input"
                  value={form.type}
                  onChange={(event) => setForm({ ...form, type: event.target.value })}
                >
                  <option value="company">Empresa</option>
                  <option value="person">Persona</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="field-label">Estado</span>
                <select
                  className="field-input"
                  value={form.status}
                  onChange={(event) => setForm({ ...form, status: event.target.value })}
                >
                  <option value="lead">Lead</option>
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                  <option value="lost">Perdido</option>
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className="field-input"
                placeholder="CIF/NIF"
                value={form.tax_id}
                onChange={(event) => setForm({ ...form, tax_id: event.target.value })}
              />

              <select
                className="field-input"
                value={form.owner_user_id}
                onChange={(event) => setForm({ ...form, owner_user_id: event.target.value })}
              >
                <option value="">Sin responsable</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className="field-input"
                placeholder="Email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />

              <input
                className="field-input"
                placeholder="Teléfono"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </div>

            <input
              className="field-input"
              placeholder="Web"
              value={form.website}
              onChange={(event) => setForm({ ...form, website: event.target.value })}
            />

            <textarea
              className="field-input min-h-24"
              placeholder="Notas"
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />

            <button className="btn-primary" disabled={saving}>
              {saving ? "Guardando..." : "Crear cliente"}
            </button>
          </form>
        </div>

        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-black text-slate-950">Clientes</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
              {clients.length}
            </span>
          </div>

          <input
            className="field-input mb-4"
            placeholder="Buscar cliente..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          <div className="max-h-[560px] space-y-2 overflow-auto pr-1">
            {clients.map((client) => (
              <button
                key={client.id}
                onClick={() => setSelectedId(client.id)}
                className={`w-full rounded-2xl border p-4 text-left transition ${selectedId === client.id
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
              >
                <p className="font-black">{client.name}</p>
                <p
                  className={`mt-1 text-xs ${selectedId === client.id ? "text-slate-300" : "text-slate-500"
                    }`}
                >
                  {client.email || "Sin email"} · {client.owner_name || "Sin responsable"}
                </p>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-6">
        {!selected ? (
          <div className="card p-8 text-center text-slate-500">
            Selecciona o crea un cliente.
          </div>
        ) : (
          <>
            <div className="card p-6">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-black text-slate-950">
                      {selected.name}
                    </h2>
                    <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-black uppercase text-brand-800">
                      {selected.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {selected.email || "Sin email"} · {selected.phone || "Sin teléfono"}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Responsable: {selected.owner_name || "Sin asignar"}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-emerald-50 p-4">
                    <p className="text-xs font-bold uppercase text-emerald-700">
                      Cobrado
                    </p>
                    <p className="mt-1 text-lg font-black text-emerald-950">
                      {formatMoney(totals.paid)}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-amber-50 p-4">
                    <p className="text-xs font-bold uppercase text-amber-700">
                      Pendiente
                    </p>
                    <p className="mt-1 text-lg font-black text-amber-950">
                      {formatMoney(totals.pending)}
                    </p>
                  </div>
                </div>
              </div>

              {selected.notes ? (
                <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                  {selected.notes}
                </p>
              ) : null}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="card p-5">
                <h3 className="mb-4 text-lg font-black text-slate-950">Contactos</h3>

                <form onSubmit={addContact} className="mb-4 grid gap-3">
                  <input
                    className="field-input"
                    placeholder="Nombre completo"
                    value={contactForm.full_name}
                    onChange={(event) =>
                      setContactForm({ ...contactForm, full_name: event.target.value })
                    }
                    required
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      className="field-input"
                      placeholder="Cargo"
                      value={contactForm.position}
                      onChange={(event) =>
                        setContactForm({ ...contactForm, position: event.target.value })
                      }
                    />

                    <input
                      className="field-input"
                      placeholder="Email"
                      value={contactForm.email}
                      onChange={(event) =>
                        setContactForm({ ...contactForm, email: event.target.value })
                      }
                    />
                  </div>

                  <button className="btn-secondary">Añadir contacto</button>
                </form>

                <div className="space-y-2">
                  {(selected.contacts || []).map((contact) => (
                    <div key={contact.id} className="rounded-2xl border border-slate-200 p-4">
                      <p className="font-bold text-slate-950">{contact.full_name}</p>
                      <p className="text-xs text-slate-500">
                        {contact.position || "Sin cargo"} · {contact.email || "Sin email"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card p-5">
                <h3 className="mb-4 text-lg font-black text-slate-950">Actividad</h3>

                <form onSubmit={addActivity} className="mb-4 grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <select
                      className="field-input"
                      value={activityForm.type}
                      onChange={(event) =>
                        setActivityForm({ ...activityForm, type: event.target.value })
                      }
                    >
                      <option value="call">Llamada</option>
                      <option value="email">Email</option>
                      <option value="meeting">Reunión</option>
                      <option value="note">Nota</option>
                    </select>

                    <input
                      className="field-input"
                      type="date"
                      value={activityForm.due_date}
                      onChange={(event) =>
                        setActivityForm({ ...activityForm, due_date: event.target.value })
                      }
                    />
                  </div>

                  <input
                    className="field-input"
                    placeholder="Título"
                    value={activityForm.title}
                    onChange={(event) =>
                      setActivityForm({ ...activityForm, title: event.target.value })
                    }
                    required
                  />

                  <textarea
                    className="field-input min-h-20"
                    placeholder="Detalle"
                    value={activityForm.body}
                    onChange={(event) =>
                      setActivityForm({ ...activityForm, body: event.target.value })
                    }
                  />

                  <button className="btn-secondary">Añadir actividad</button>
                </form>

                <div className="space-y-2">
                  {(selected.activities || []).map((activity) => (
                    <div key={activity.id} className="rounded-2xl border border-slate-200 p-4">
                      <p className="font-bold text-slate-950">{activity.title}</p>
                      <p className="text-xs text-slate-500">
                        {activity.type} ·{" "}
                        {new Date(activity.created_at).toLocaleDateString("es-ES")}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="card p-5">
              <h3 className="mb-4 text-lg font-black text-slate-950">
                Datos económicos
              </h3>

              <form
                onSubmit={addFinancial}
                className="mb-4 grid gap-3 lg:grid-cols-[1fr_130px_150px_150px_auto]"
              >
                <input
                  className="field-input"
                  placeholder="Concepto"
                  value={financialForm.concept}
                  onChange={(event) =>
                    setFinancialForm({ ...financialForm, concept: event.target.value })
                  }
                  required
                />

                <input
                  className="field-input"
                  type="number"
                  step="0.01"
                  placeholder="Importe"
                  value={financialForm.amount}
                  onChange={(event) =>
                    setFinancialForm({ ...financialForm, amount: event.target.value })
                  }
                  required
                />

                <input
                  className="field-input"
                  type="date"
                  value={financialForm.record_date}
                  onChange={(event) =>
                    setFinancialForm({
                      ...financialForm,
                      record_date: event.target.value,
                    })
                  }
                />

                <select
                  className="field-input"
                  value={financialForm.status}
                  onChange={(event) =>
                    setFinancialForm({ ...financialForm, status: event.target.value })
                  }
                >
                  <option value="pending">Pendiente</option>
                  <option value="paid">Pagado</option>
                  <option value="cancelled">Cancelado</option>
                </select>

                <button className="btn-secondary">Añadir</button>
              </form>

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="p-3">Concepto</th>
                      <th className="p-3">Fecha</th>
                      <th className="p-3">Estado</th>
                      <th className="p-3 text-right">Importe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(selected.financialRecords || []).map((record) => (
                      <tr key={record.id}>
                        <td className="p-3 font-semibold">{record.concept}</td>
                        <td className="p-3 text-slate-500">{record.record_date}</td>
                        <td className="p-3 text-slate-500">{record.status}</td>
                        <td className="p-3 text-right font-black">
                          {formatMoney(record.amount_cents, record.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}