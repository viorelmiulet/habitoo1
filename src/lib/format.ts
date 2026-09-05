export function formatMoney(
  value: number | null | undefined,
  currency: string | null | undefined = "EUR",
) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: currency || "EUR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

export function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("ro-RO").format(Number(value));
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium" }).format(new Date(value));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

export function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ro-RO", { timeStyle: "short" }).format(new Date(value));
}

export function relativeDays(value: string | null | undefined) {
  if (!value) return "—";
  const diff = Math.round((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (diff === 0) return "azi";
  if (diff === 1) return "ieri";
  if (diff > 1) return `acum ${diff} zile`;
  if (diff === -1) return "mâine";
  return `în ${Math.abs(diff)} zile`;
}

export function initials(name: string | null | undefined) {
  if (!name) return "??";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}
