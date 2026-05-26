import { useEffect, useMemo, useState } from "react";
import { api, formatMoney } from "./api";

type DashboardData = {
  ok: true;
  stats: {
    clients: number;
    openTasks: number;
    revenueCents: number;
    pendingCents: number;
  };
  recentClients: Array<{
    id: string;
    name: string;
    status: string;
    email: string | null;
  }>;
  recentActivities: Array<{
    id: string;
    title: string;
    type: string;
    created_at: string;
    client_name: string | null;
  }>;
};

const statusLabels: Record<string, string> = {
  lead: "Lead",
  active: "Activo",
  inactive: "Inactivo",
  lost: "Perdido",
};

const statusClasses: Record<string, string> = {
  lead: "bg-blue-50 text-blue-700 ring-blue-100",
  active: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  inactive: "bg-slate-50 text-slate-600 ring-slate-200",
  lost: "bg-red-50 text-red-700 ring-red-100",
};

const activityLabels: Record<string, string> = {
  call: "Llamada",
  email: "Email",
  meeting: "Reunión",
  note: "Nota",
  task: "Tarea",
};

const activityIcons: Record<string, string> = {
  call: "☎️",
  email: "✉️",
  meeting: "🤝",
  note: "📝",
  task: "✅",
};

export default function DashboardApp() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<DashboardData>("/api/dashboard")
      .then(setData)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Error cargando dashboard"),
      );
  }, []);

  const cards = useMemo(() => {
    if (!data) return [];

    return [
      {
        label: "Clientes",
        value: data.stats.clients.toString(),
        note: "Total registrados",
        icon: "👥",
        href: "/clientes",
        accent: "from-[#06cbad] to-[#866afa]",
      },
      {
        label: "Tareas abiertas",
        value: data.stats.openTasks.toString(),
        note: "Pendientes de resolver",
        icon: "📌",
        href: "/tareas",
        accent: "from-[#5233ff] to-[#866afa]",
      },
      {
        label: "Ingresos cobrados",
        value: formatMoney(data.stats.revenueCents),
        note: "Registros pagados",
        icon: "💶",
        href: "/economia",
        accent: "from-[#06cbad] to-[#5233ff]",
      },
      {
        label: "Pendiente de cobro",
        value: formatMoney(data.stats.pendingCents),
        note: "Facturación pendiente",
        icon: "⏳",
        href: "/economia",
        accent: "from-[#866afa] to-[#06cbad]",
      },
    ];
  }, [data]);

  if (error) {
    return (
      <div className="card border-red-100 bg-red-50 p-6 text-red-700">
        <p className="font-black">No se ha podido cargar el dashboard</p>
        <p className="mt-1 text-sm font-medium">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="grid gap-6">
        <div className="card animate-pulse p-6">
          <div className="h-8 w-64 rounded-xl bg-slate-100" />
          <div className="mt-3 h-4 w-96 max-w-full rounded-xl bg-slate-100" />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="card animate-pulse p-5">
              <div className="h-5 w-24 rounded-xl bg-slate-100" />
              <div className="mt-4 h-8 w-32 rounded-xl bg-slate-100" />
              <div className="mt-3 h-4 w-36 rounded-xl bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const cashBalance = data.stats.revenueCents - data.stats.pendingCents;
  const hasRecentClients = data.recentClients.length > 0;
  const hasRecentActivities = data.recentActivities.length > 0;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[1.25rem] border border-white/10 bg-[linear-gradient(135deg,rgba(82,51,255,.34),rgba(17,17,17,.96)_42%,rgba(6,203,173,.16))] p-6 text-white shadow-[0_0_44px_rgba(82,51,255,0.18)] md:p-8">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#866afa] to-transparent" />
        <div className="absolute inset-x-6 bottom-0 h-px bg-gradient-to-r from-transparent via-[#06cbad] to-transparent" />

        <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-white/80 ring-1 ring-white/15">
              Panel de control
            </p>
            <h1 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
              Resumen general del CRM
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Vista rápida de clientes, tareas y datos económicos. Desde aquí puedes
              entrar directamente a las áreas principales de gestión.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <a
              href="/clientes"
              className="rounded-2xl bg-gradient-to-r from-[#06cbad] to-[#866afa] px-4 py-3 text-sm font-black text-white shadow-[0_0_24px_rgba(6,203,173,0.22)] transition hover:-translate-y-0.5"
            >
              + Nuevo cliente
            </a>
            <a
              href="/tareas"
              className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white ring-1 ring-white/15 transition hover:-translate-y-0.5 hover:bg-white/15"
            >
              Ver tareas
            </a>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <a
            key={card.label}
            href={card.href}
            className="card group overflow-hidden p-0 transition hover:-translate-y-1 hover:shadow-lg"
          >
            <div className={`h-1.5 bg-gradient-to-r ${card.accent}`} />
            <div className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-slate-500">{card.label}</p>
                  <p className="mt-2 text-2xl font-black text-slate-950">
                    {card.value}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-400">
                    {card.note}
                  </p>
                </div>

                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-50 text-xl ring-1 ring-slate-100 transition group-hover:scale-110">
                  {card.icon}
                </div>
              </div>
            </div>
          </a>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 p-5">
            <div>
              <h2 className="text-lg font-black text-slate-950">Últimos clientes</h2>
              <p className="mt-1 text-sm text-slate-500">
                Clientes añadidos o actualizados recientemente.
              </p>
            </div>

            <a
              className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white transition hover:bg-slate-800"
              href="/clientes"
            >
              Abrir
            </a>
          </div>

          <div className="p-5">
            {!hasRecentClients ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                <p className="font-black text-slate-950">Todavía no hay clientes</p>
                <p className="mt-1 text-sm text-slate-500">
                  Cuando crees clientes aparecerán aquí.
                </p>
                <a
                  href="/clientes"
                  className="mt-4 inline-flex rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-slate-800"
                >
                  Crear cliente
                </a>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {data.recentClients.map((client) => (
                  <a
                    key={client.id}
                    href="/clientes"
                    className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-black text-slate-950">
                          {client.name}
                        </p>
                        <p className="mt-1 truncate text-xs font-medium text-slate-500">
                          {client.email || "Sin email"}
                        </p>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase ring-1 ${statusClasses[client.status] ||
                          "bg-slate-50 text-slate-600 ring-slate-200"
                          }`}
                      >
                        {statusLabels[client.status] || client.status}
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 p-5">
            <h2 className="text-lg font-black text-slate-950">Estado económico</h2>
            <p className="mt-1 text-sm text-slate-500">
              Lectura rápida de cobrado frente a pendiente.
            </p>
          </div>

          <div className="space-y-4 p-5">
            <div className="rounded-3xl bg-emerald-50 p-5 ring-1 ring-emerald-100">
              <p className="text-xs font-black uppercase text-emerald-700">
                Cobrado
              </p>
              <p className="mt-2 text-3xl font-black text-emerald-950">
                {formatMoney(data.stats.revenueCents)}
              </p>
            </div>

            <div className="rounded-3xl bg-amber-50 p-5 ring-1 ring-amber-100">
              <p className="text-xs font-black uppercase text-amber-700">
                Pendiente
              </p>
              <p className="mt-2 text-3xl font-black text-amber-950">
                {formatMoney(data.stats.pendingCents)}
              </p>
            </div>

            <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-100">
              <p className="text-xs font-black uppercase text-slate-500">
                Balance visual
              </p>
              <p className="mt-2 text-2xl font-black text-slate-950">
                {formatMoney(cashBalance)}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Cobrado menos pendiente.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 p-5">
          <div>
            <h2 className="text-lg font-black text-slate-950">Actividad reciente</h2>
            <p className="mt-1 text-sm text-slate-500">
              Últimos movimientos registrados en clientes.
            </p>
          </div>

          <a
            href="/clientes"
            className="hidden rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-200 sm:inline-flex"
          >
            Ver clientes
          </a>
        </div>

        <div className="p-5">
          {!hasRecentActivities ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <p className="font-black text-slate-950">Sin actividad registrada</p>
              <p className="mt-1 text-sm text-slate-500">
                Las llamadas, notas, reuniones y emails aparecerán en esta zona.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.recentActivities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-50 text-lg ring-1 ring-slate-100">
                    {activityIcons[activity.type] || "📝"}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="font-black text-slate-950">{activity.title}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {activityLabels[activity.type] || activity.type} ·{" "}
                      {activity.client_name || "Sin cliente"}
                    </p>
                  </div>

                  <p className="hidden shrink-0 text-xs font-bold text-slate-400 sm:block">
                    {new Date(activity.created_at).toLocaleDateString("es-ES")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
