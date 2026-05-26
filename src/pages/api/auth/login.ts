import type { APIRoute } from "astro";
import { AUTH_COOKIE, createSessionToken, getSecureCookieFlag, SESSION_TTL_SECONDS } from "../../../lib/auth";
import { getDb, rowToObject } from "../../../lib/db";
import { verifyPassword } from "../../../lib/password";
import { badRequest, json, readJson, serverError } from "../../../lib/http";

type LoginBody = { email?: string; password?: string };
type UserRow = { id: string; email: string; name: string; role: "admin" | "member"; password_hash: string; is_active: number };

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await readJson<LoginBody>(request);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) return badRequest("Email y contraseña son obligatorios");

    const db = getDb();
    const result = await db.execute({
      sql: "SELECT id, email, name, role, password_hash, is_active FROM users WHERE lower(email) = lower(?) LIMIT 1",
      args: [email],
    });

    const user = result.rows[0] ? rowToObject<UserRow>(result.rows[0]) : null;
    if (!user || !user.is_active || !verifyPassword(password, user.password_hash)) {
      return json({ ok: false, error: "Credenciales incorrectas" }, { status: 401 });
    }

    const token = await createSessionToken({ id: user.id, email: user.email, name: user.name, role: user.role });

    cookies.set(AUTH_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: getSecureCookieFlag(),
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });

    return json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
};
