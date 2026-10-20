export const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: paise % 100 === 0 ? 0 : 2,
  }).format(paise / 100);
export const date = (value: string) =>
  new Date(value.includes("T") ? value : value + "Z").toLocaleDateString(
    "en-IN",
    { day: "numeric", month: "short", year: "numeric" },
  );
export async function api<T = any>(
  path: string,
  data?: unknown,
  method?: string,
): Promise<T> {
  const res = await fetch("/api/" + path, {
    method: method || (data === undefined ? "GET" : "POST"),
    headers:
      data === undefined ? undefined : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
    cache: "no-store",
  });
  const result = (await res.json()) as T & { error?: string };
  if (!res.ok)
    throw new Error(result.error || "Unable to complete your request.");
  return result;
}
export const methodNames: Record<string, string> = {
  credit_card: "Credit card",
  debit_card: "Debit card",
  gpay: "Google Pay",
  upi: "UPI",
  netbanking: "Net banking",
  paypal: "PayPal",
};
export function csvDownload(filename: string, rows: unknown[][]) {
  const safe = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const blob = new Blob(
    ["\uFEFF" + rows.map((r) => r.map(safe).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8;" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
