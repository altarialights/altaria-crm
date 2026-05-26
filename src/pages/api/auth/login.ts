import type { APIRoute } from "astro";
import { AUTH_COOKIE, createSessionToken, getSecureCookieFlag, SESSION_TTL_SECONDS } from "../../../lib/auth";
import { ensureUserAuthSchema, getDb, rowToObject } from "../../../lib/db";
import { verifyPassword } from "../../../lib/password";
import { badRequest, json, readJson, serverError } from "../../../lib/http";

type LoginBody = { username?: string; password?: string };
type UserRow = { id: string; username: string; name: string; password_hash: string; is_active: number };

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await readJson<LoginBody>(request);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    if (!username || !password) return badRequest("Usuario y contraseña son obligatorios");

    const db = getDb();
    await ensureUserAuthSchema(db);
    const result = await db.execute({
      sql: "SELECT id, username, name, password_hash, is_active FROM users WHERE lower(username) = lower(?) LIMIT 1",
      args: [username],
    });

    const user = result.rows[0] ? rowToObject<UserRow>(result.rows[0]) : null;
    if (!user || !user.is_active || !verifyPassword(password, user.password_hash)) {
      return json({ ok: false, error: "Credenciales incorrectas" }, { status: 401 });
    }

    const token = await createSessionToken({ id: user.id, username: user.username, name: user.name });

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
