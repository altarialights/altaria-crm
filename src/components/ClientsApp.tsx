import { useEffect, useMemo, useState } from "react";
import { api, formatMoney } from "./api";

type User = { id: string; name: string; username: string };

type Contact = {
  id: string;
  full_name: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  is_primary: number;
  notes: string | null;
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
  contact_status: string | null;
  contacted_at: string | null;
  contact_response: string | null;
  created_at: string;
  updated_at?: string;
  contacts?: Contact[];
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

const contactStatusLabels: Record<string, string> = {
  not_contacted: "No contactado",
  contacted: "Contactado",
  responded: "Respondió",
  no_response: "Sin respuesta",
  not_interested: "No interesado",
};

const contactStatusClasses: Record<string, string> = {
  not_contacted: "bg-white/5 text-white/70 ring-white/10",
  contacted: "bg-brand-500/15 text-brand-100 ring-brand-400/30",
  responded: "bg-emerald-500/15 text-emerald-100 ring-emerald-400/30",
  no_response: "bg-amber-500/15 text-amber-100 ring-amber-400/30",
  not_interested: "bg-red-500/15 text-red-100 ring-red-400/30",
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
  const [trackingForm, setTrackingForm] = useState({
    contact_status: "not_contacted",
    contacted_at: "",
    contact_response: "",
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
  const [trackingSaving, setTrackingSaving] = useState(false);

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

  useEffect(() => {
    if (!selected) return;

    setTrackingForm({
      contact_status: selected.contact_status || "not_contacted",
      contacted_at: selected.contacted_at || "",
      contact_response: selected.contact_response || "",
    });
  }, [selected]);

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

  async function updateContactTracking(event: React.FormEvent) {
    event.preventDefault();

    if (!selected) return;

    setTrackingSaving(true);
    setError("");

    try {
      const data = await api<{ ok: true; client: Client }>(`/api/clients/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify(trackingForm),
      });

      setSelected((current) => (current ? { ...current, ...data.client } : data.client));
      setClients((currentClients) =>
        currentClients.map((client) =>
          client.id === selected.id ? { ...client, ...data.client } : client,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando seguimiento");
    } finally {
      setTrackingSaving(false);
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
    <div className="grid min-w-0 gap-6 2xl:grid-cols-[420px_minmax(0,1fr)]">
      <section className="min-w-0 space-y-4">
        <div className="card p-4 sm:p-5">
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

        <div className="card p-4 sm:p-5">
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

          <div className="max-h-[46vh] space-y-2 overflow-auto pr-1 2xl:max-h-[560px]">
            {clients.map((client) => (
              <button
                key={client.id}
                onClick={() => setSelectedId(client.id)}
                className={`w-full rounded-2xl border p-3 text-left transition sm:p-4 ${selectedId === client.id
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 truncate font-black">{client.name}</p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase ring-1 ${contactStatusClasses[client.contact_status || "not_contacted"]}`}
                  >
                    {contactStatusLabels[client.contact_status || "not_contacted"]}
                  </span>
                </div>
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

      <section className="min-w-0 space-y-6">
        {!selected ? (
          <div className="card p-8 text-center text-slate-500">
            Selecciona o crea un cliente.
          </div>
        ) : (
          <>
            <div className="card p-4 sm:p-6">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="min-w-0 break-words text-xl font-black text-slate-950 sm:text-2xl">
                      {selected.name}
                    </h2>
                    <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-black uppercase text-brand-800">
                      {selected.status}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-black uppercase ring-1 ${contactStatusClasses[selected.contact_status || "not_contacted"]}`}
                    >
                      {contactStatusLabels[selected.contact_status || "not_contacted"]}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {selected.email || "Sin email"} · {selected.phone || "Sin teléfono"}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Responsable: {selected.owner_name || "Sin asignar"}
                  </p>
                </div>

                <div className="grid w-full gap-3 sm:grid-cols-2 md:w-auto">
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
              <div className="card p-4 sm:p-5">
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

              <div className="card p-4 sm:p-5">
                <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row">
                  <div className="min-w-0">
                    <h3 className="text-lg font-black text-slate-950">
                      Contacto y respuesta
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Guarda si ya se ha contactado con el cliente y qué contestó.
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-black uppercase ring-1 ${contactStatusClasses[trackingForm.contact_status]}`}
                  >
                    {contactStatusLabels[trackingForm.contact_status]}
                  </span>
                </div>

                <form onSubmit={updateContactTracking} className="grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1">
                      <span className="field-label">Estado de contacto</span>
                      <select
                        className="field-input"
                        value={trackingForm.contact_status}
                        onChange={(event) =>
                          setTrackingForm({
                            ...trackingForm,
                            contact_status: event.target.value,
                          })
                        }
                      >
                        <option value="not_contacted">No contactado</option>
                        <option value="contacted">Contactado</option>
                        <option value="responded">Respondió</option>
                        <option value="no_response">Sin respuesta</option>
                        <option value="not_interested">No interesado</option>
                      </select>
                    </label>

                    <label className="space-y-1">
                      <span className="field-label">Fecha de contacto</span>
                      <input
                        className="field-input"
                        type="date"
                        value={trackingForm.contacted_at}
                        onChange={(event) =>
                          setTrackingForm({
                            ...trackingForm,
                            contacted_at: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>

                  <label className="space-y-1">
                    <span className="field-label">Respuesta del cliente</span>
                    <textarea
                      className="field-input min-h-28"
                      placeholder="Ej: Le interesa recibir presupuesto la semana que viene."
                      value={trackingForm.contact_response}
                      onChange={(event) =>
                        setTrackingForm({
                          ...trackingForm,
                          contact_response: event.target.value,
                        })
                      }
                    />
                  </label>

                  <button className="btn-secondary" disabled={trackingSaving}>
                    {trackingSaving ? "Guardando..." : "Guardar seguimiento"}
                  </button>
                </form>

                {selected.contact_response ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-black uppercase text-slate-500">
                      Última respuesta guardada
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {selected.contact_response}
                    </p>
                    <p className="mt-2 text-xs font-semibold text-slate-500">
                      {selected.contacted_at
                        ? new Date(selected.contacted_at).toLocaleDateString("es-ES")
                        : "Sin fecha de contacto"}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="card p-4 sm:p-5">
              <h3 className="mb-4 text-lg font-black text-slate-950">
                Datos económicos
              </h3>

              <form
                onSubmit={addFinancial}
                className="mb-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_130px_150px_150px_auto]"
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

              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-[640px] text-left text-sm">
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
