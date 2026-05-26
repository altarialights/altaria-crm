import { createClient } from "@libsql/client";
import { randomUUID } from "node:crypto";
import { getDbConfig } from "./_env.mjs";
import { hashPassword } from "./_password.mjs";

const [, , usernameRaw, nameRaw, password] = process.argv;

const username = String(usernameRaw || "").trim();
const name = String(nameRaw || "").trim();

if (!username || !name || !password) {
  console.error('Uso: pnpm user:create usuario "Nombre Usuario" "password-segura"');
  process.exit(1);
}

const db = createClient(getDbConfig());
const id = randomUUID();
const now = new Date().toISOString();
const passwordHash = hashPassword(password);

const tableInfo = await db.execute("PRAGMA table_info(users)");
const columns = new Set(tableInfo.rows.map((row) => String(row.name || "")));

if (!columns.has("username")) {
  await db.execute("ALTER TABLE users ADD COLUMN username TEXT");

  if (columns.has("email")) {
    await db.execute(`
      UPDATE users
      SET username = lower(email)
      WHERE username IS NULL OR trim(username) = ''
    `);
  }
}

await db.execute(
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_nocase ON users(username COLLATE NOCASE)",
);

const fields = ["id", "username", "name", "password_hash", "is_active", "created_at", "updated_at"];
const placeholders = ["?", "?", "?", "?", "1", "?", "?"];
const args = [id, username, name, passwordHash, now, now];

if (columns.has("email")) {
  fields.splice(2, 0, "email");
  placeholders.splice(2, 0, "?");
  args.splice(2, 0, username);
}

await db.execute({
  sql: `
    INSERT INTO users (${fields.join(", ")})
    VALUES (${placeholders.join(", ")})
  `,
  args,
});

console.log("Usuario creado correctamente:");
console.log(`ID: ${id}`);
console.log(`Usuario: ${username}`);
