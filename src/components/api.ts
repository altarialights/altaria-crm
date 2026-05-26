export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Error de API");
  }
  return data as T;
}

export function formatMoney(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
  }).format((Number(cents) || 0) / 100);
}

export function toInputDate(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}
