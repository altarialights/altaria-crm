import type { APIRoute } from "astro";
import { AUTH_COOKIE, getSecureCookieFlag } from "../../../lib/auth";

export const POST: APIRoute = async ({ cookies, redirect }) => {
  cookies.delete(AUTH_COOKIE, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: getSecureCookieFlag(),
  });
  return redirect("/login");
};
