import type { APIRoute } from "astro";
import { json } from "../../../lib/http";

export const GET: APIRoute = async ({ locals }) => {
  return json({ ok: true, user: locals.user });
};
