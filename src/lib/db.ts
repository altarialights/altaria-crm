import { createClient, type Client } from "@libsql/client";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

let client: Client | null = null;
let dotEnvLoaded = false;

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

export function rowToObject<T>(row: unknown): T {
  return row as T;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function uuid(): string {
  return crypto.randomUUID();
}