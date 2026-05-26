import { jwtVerify, SignJWT } from "jose";
import { ensureUserAuthSchema, getDb, rowToObject } from "./db";

export const AUTH_COOKIE = "altaria_crm_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type SessionUser = {
  id: string;
  username: string;
  name: string;
};

type JwtPayload = SessionUser & {
  typ: "session";
};

function getJwtSecret(): Uint8Array {
  const secret = import.meta.env.JWT_SECRET;

  if (!secret) {
    throw new Error("Falta JWT_SECRET en las variables de entorno.");
  }

  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user, typ: "session" } satisfies JwtPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());

    if (payload.typ !== "session") return null;
    if (typeof payload.id !== "string") return null;
    if (typeof payload.username !== "string") return null;
    if (typeof payload.name !== "string") return null;

    const db = getDb();
    await ensureUserAuthSchema(db);
    const result = await db.execute({
      sql: "SELECT id, username, name FROM users WHERE id = ? AND is_active = 1 LIMIT 1",
      args: [payload.id],
    });

    const user = result.rows[0]
      ? rowToObject<SessionUser>(result.rows[0])
      : null;

    return user;
  } catch {
    return null;
  }
}

export function getSecureCookieFlag(): boolean {
  return import.meta.env.NODE_ENV === "production";
}
