import { createClient, type Client } from "@libsql/client";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

let client: Client | null = null;
let dotEnvLoaded = false;
let clientTrackingSchemaReady: Promise<void> | null = null;
let userAuthSchemaReady: Promise<void> | null = null;

type RequiredEnvName = "TURSO_DATABASE_URL" | "TURSO_AUTH_TOKEN";

function loadDotEnvIntoProcessEnv(): void {
  if (dotEnvLoaded) return;
  dotEnvLoaded = true;

  const envPath = path.resolve(process.cwd(), ".env");

  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");

    if (equalsIndex === -1) {
      continue;
    }

    const key = line
      .slice(0, equalsIndex)
      .trim()
      .replace(/^\uFEFF/, "");

    let value = line.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function readEnv(name: RequiredEnvName): string | undefined {
  const astroEnv = (import.meta as any).env?.[name];

  if (typeof astroEnv === "string" && astroEnv.trim() !== "") {
    return astroEnv.trim();
  }

  loadDotEnvIntoProcessEnv();

  const nodeEnv = process.env[name];

  if (typeof nodeEnv === "string" && nodeEnv.trim() !== "") {
    return nodeEnv.trim();
  }

  return undefined;
}

function getRequiredEnv(name: RequiredEnvName): string {
  const value = readEnv(name);

  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Comprueba que existe un archivo .env en la raíz del proyecto y que no se llama .env.txt.`
    );
  }

  return value;
}

export function getDb(): Client {
  if (client) return client;

  const url = getRequiredEnv("TURSO_DATABASE_URL");
  const authToken = getRequiredEnv("TURSO_AUTH_TOKEN");

  client = createClient({
    url,
    authToken,
  });

  return client;
}

export async function ensureClientTrackingSchema(db = getDb()): Promise<void> {
  if (clientTrackingSchemaReady) {
    return clientTrackingSchemaReady;
  }

  clientTrackingSchemaReady = (async () => {
    const tableInfo = await db.execute("PRAGMA table_info(clients)");
    const existingColumns = new Set(
      tableInfo.rows.map((row) => String((row as { name?: unknown }).name || "")),
    );

    const columns = [
      {
        name: "contact_status",
        sql: `
          ALTER TABLE clients
          ADD COLUMN contact_status TEXT NOT NULL DEFAULT 'not_contacted'
          CHECK (contact_status IN ('not_contacted', 'contacted', 'responded', 'no_response', 'not_interested'))
        `,
      },
      {
        name: "contacted_at",
        sql: "ALTER TABLE clients ADD COLUMN contacted_at TEXT",
      },
      {
        name: "contact_response",
        sql: "ALTER TABLE clients ADD COLUMN contact_response TEXT",
      },
    ];

    for (const column of columns) {
      if (!existingColumns.has(column.name)) {
        await db.execute(column.sql);
      }
    }

    await db.execute(
      "CREATE INDEX IF NOT EXISTS idx_clients_contact_status ON clients(contact_status)",
    );
  })().catch((error) => {
    clientTrackingSchemaReady = null;
    throw error;
  });

  return clientTrackingSchemaReady;
}

export async function ensureUserAuthSchema(db = getDb()): Promise<void> {
  if (userAuthSchemaReady) {
    return userAuthSchemaReady;
  }

  userAuthSchemaReady = (async () => {
    const tableInfo = await db.execute("PRAGMA table_info(users)");
    const existingColumns = new Set(
      tableInfo.rows.map((row) => String((row as { name?: unknown }).name || "")),
    );

    if (!existingColumns.has("username")) {
      await db.execute("ALTER TABLE users ADD COLUMN username TEXT");

      if (existingColumns.has("email")) {
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
  })().catch((error) => {
    userAuthSchemaReady = null;
    throw error;
  });

  return userAuthSchemaReady;
}

export function rowToObject<T>(row: unknown): T {
  return row as T;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function uuid(): string {
  return crypto.randomUUID();
}
