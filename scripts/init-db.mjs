import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { getDbConfig } from "./_env.mjs";

const db = createClient(getDbConfig());
const schema = fs.readFileSync(path.resolve(process.cwd(), "database/schema.sql"), "utf8");
const seed = fs.readFileSync(path.resolve(process.cwd(), "database/seed.sql"), "utf8");

await db.executeMultiple(schema);
await db.executeMultiple(seed);

console.log("Base de datos inicializada correctamente.");
console.log("Usuario inicial: admin@crm.local / admin1234");
