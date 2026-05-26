import { defineMiddleware } from "astro:middleware";
import { AUTH_COOKIE, verifySessionToken } from "./lib/auth";
import { json } from "./lib/http";

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/favicon.svg",
]);

function isPublicAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_astro/") ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/images/") ||
    pathname.includes(".")
  );
}

function isApi(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, search } = context.url;

  if (PUBLIC_PATHS.has(pathname) || isPublicAsset(pathname)) {
    return next();
  }

  const token = context.cookies.get(AUTH_COOKIE)?.value;
  const user = token ? await verifySessionToken(token) : null;

  if (!user) {
    if (isApi(pathname)) {
      return json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const redirectTo = pathname + search;
    return context.redirect(`/login?redirect=${encodeURIComponent(redirectTo)}`);
  }

  context.locals.user = user;
  return next();
});
