import { useState } from "react";
import { api } from "./api";

type LoginResponse = { ok: true };

export default function LoginForm() {
  const [email, setEmail] = useState("admin@crm.local");
  const [password, setPassword] = useState("admin1234");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      const params = new URLSearchParams(window.location.search);
      window.location.href = params.get("redirect") || "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <label className="block space-y-2">
        <span className="field-label">Email</span>
        <input
          className="field-input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>

      <label className="block space-y-2">
        <span className="field-label">Contraseña</span>
        <input
          className="field-input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>

      <button className="btn-primary w-full py-3" disabled={loading}>
        {loading ? "Entrando..." : "Entrar al CRM"}
      </button>
    </form>
  );
}
