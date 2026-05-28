import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

let dotEnvLoaded = false;

function loadDotEnv(): void {
  if (dotEnvLoaded) return;
  dotEnvLoaded = true;

  const envPath = path.resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = line.slice(0, equalsIndex).trim().replace(/^﻿/, "");
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

function readBlobEnv(name: string): string | undefined {
  const astroEnv = (import.meta as any).env?.[name];
  if (typeof astroEnv === "string" && astroEnv.trim() !== "") {
    return astroEnv.trim();
  }

  loadDotEnv();

  const nodeEnv = process.env[name];
  if (typeof nodeEnv === "string" && nodeEnv.trim() !== "") {
    return nodeEnv.trim();
  }

  return undefined;
}

export function getBlobToken(): string {
  const token = readBlobEnv("BLOB_READ_WRITE_TOKEN");
  if (!token) {
    throw new Error(
      "Falta la variable de entorno BLOB_READ_WRITE_TOKEN. Configúrala en .env o en Vercel.",
    );
  }
  return token;
}

export function getBlobStoreId(): string | undefined {
  return readBlobEnv("BLOB_STORE_ID");
}

const safeNameMaxLength = 80;

export function safeFileName(name: string): string {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "archivo";

  const lastDot = trimmed.lastIndexOf(".");
  const baseRaw = lastDot > 0 ? trimmed.slice(0, lastDot) : trimmed;
  const extRaw = lastDot > 0 ? trimmed.slice(lastDot + 1) : "";

  const normalize = (input: string) =>
    input
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "");

  const base = normalize(baseRaw).slice(0, safeNameMaxLength) || "archivo";
  const ext = normalize(extRaw).slice(0, 12);

  return ext ? `${base}.${ext}` : base;
}

export function fileKindFromMime(mime: string | null | undefined, fileName?: string): string {
  const m = (mime || "").toLowerCase();
  const ext = (fileName || "").split(".").pop()?.toLowerCase() || "";

  if (m.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "heic"].includes(ext)) {
    return "image";
  }
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (
    m.includes("word") ||
    m === "application/msword" ||
    m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ["doc", "docx", "odt", "rtf"].includes(ext)
  ) {
    return "word";
  }
  if (
    m.includes("excel") ||
    m === "application/vnd.ms-excel" ||
    m === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    ["xls", "xlsx", "ods", "csv"].includes(ext)
  ) {
    return "excel";
  }
  return "generic";
}
