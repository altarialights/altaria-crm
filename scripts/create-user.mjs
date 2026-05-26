import { createClient } from "@libsql/client";
import { randomUUID } from "node:crypto";
import { getDbConfig } from "./_env.mjs";
import { hashPassword } from "./_password.mjs";

const [, , emailRaw, nameRaw, password, roleRaw = "member"] = process.argv;

const email = String(emailRaw || "").trim().toLowerCase();
const name = String(nameRaw || "").trim();
const role = roleRaw === "admin" ? "admin" : "member";

if (!email || !name || !password) {
  console.error('Uso: pnpm user:create usuario@empresa.com "Nombre Usuario" "password-segura" admin');
  process.exit(1);
}

const db = createClient(getDbConfig());
const id = randomUUID();
const now = new Date().toISOString();
const passwordHash = hashPassword(password);

await db.execute({
  sql: `
    INSERT INTO users (id, email, name, role, password_hash, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `,
  args: [id, email, name, role, passwordHash, now, now],
});

console.log("Usuario creado correctamente:");
console.log(`ID: ${id}`);
console.log(`Email: ${email}`);
console.log(`Rol: ${role}`);
