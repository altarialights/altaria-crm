import { useEffect, useState } from "react";
import { api } from "./api";

type User = { id: string; email: string; name: string; role: string; is_active: number; created_at: string };
type UsersResponse = { ok: true; users: User[] };

export default function UsersApp() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<UsersResponse>("/api/users")
      .then((data) => setUsers(data.users))
      .catch((err) => setError(err instanceof Error ? err.message : "Error cargando usuarios"));
  }, []);

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h2 className="text-lg font-black text-slate-950">Usuarios privados</h2>
        <p className="mt-2 text-sm text-slate-600">
          No existe registro público. Crea usuarios con <code className="rounded bg-slate-100 px-1 py-0.5">pnpm user:create</code> o insertando manualmente el hash generado con <code className="rounded bg-slate-100 px-1 py-0.5">pnpm user:password</code>.
        </p>
      </section>

      {error ? <div className="card p-5 text-red-700">{error}</div> : null}

      <section className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-4">Nombre</th><th className="p-4">Email</th><th className="p-4">Rol</th><th className="p-4">Estado</th><th className="p-4">Creado</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((user) => <tr key={user.id}><td className="p-4 font-black">{user.name}</td><td className="p-4 text-slate-500">{user.email}</td><td className="p-4 text-slate-500">{user.role}</td><td className="p-4 text-slate-500">{user.is_active ? "Activo" : "Inactivo"}</td><td className="p-4 text-slate-500">{new Date(user.created_at).toLocaleDateString("es-ES")}</td></tr>)}
          </tbody>
        </table>
      </section>
    </div>
  );
}
