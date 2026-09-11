import { toast } from "sonner";

/**
 * Transformă erorile tehnice (Supabase / Postgres / rețea) în mesaje clare
 * pentru utilizator, în limba română. Mesajul tehnic rămâne în consolă.
 */
export function friendlyError(
  error: unknown,
  fallback = "A apărut o eroare. Încearcă din nou.",
): string {
  const raw = extractMessage(error);
  const code = extractCode(error);
  const lower = raw.toLowerCase();

  if (!raw && !code) return fallback;

  if (code === "23505" || lower.includes("duplicate key")) {
    return "Există deja o înregistrare cu aceste date.";
  }
  if (code === "23503" || lower.includes("foreign key")) {
    return "Înregistrarea este folosită în altă parte și nu poate fi modificată așa.";
  }
  if (code === "23502" || lower.includes("null value in column")) {
    return "Lipsește un câmp obligatoriu.";
  }
  if (code === "23514" || lower.includes("violates check constraint")) {
    return "Una dintre valori nu este acceptată. Verifică datele introduse.";
  }
  if (
    code === "42501" ||
    lower.includes("row-level security") ||
    lower.includes("permission denied")
  ) {
    return "Nu ai permisiunea necesară pentru această acțiune.";
  }
  if (code === "PGRST116" || lower.includes("0 rows")) {
    return "Înregistrarea nu a fost găsită.";
  }
  if (code === "PGRST301" || lower.includes("jwt expired") || lower.includes("invalid jwt")) {
    return "Sesiunea a expirat. Autentifică-te din nou.";
  }
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed")
  ) {
    return "Nu s-a putut contacta serverul. Verifică conexiunea la internet.";
  }
  if (lower.includes("payload too large") || lower.includes("exceeded the maximum allowed size")) {
    return "Fișierul este prea mare.";
  }
  if (lower.includes("invalid input syntax")) {
    return "Formatul uneia dintre valori nu este valid.";
  }
  if (lower.includes("timeout") || lower.includes("statement timeout")) {
    return "Operațiunea a durat prea mult. Încearcă din nou.";
  }

  // Mesajele scrise deja în română (validări din aplicație) se afișează ca atare.
  if (raw && /[ăâîșțĂÂÎȘȚ]/.test(raw)) return raw;
  if (raw && raw.length <= 120 && !/[_{}[\]<>]/.test(raw) && !/^(error|exception)/i.test(raw)) {
    return raw;
  }
  return fallback;
}

export function toastError(error: unknown, fallback?: string) {
  console.error(error);
  toast.error(friendlyError(error, fallback));
}

function extractMessage(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const e = error as { message?: unknown; error_description?: unknown; details?: unknown };
    if (typeof e.message === "string") return e.message;
    if (typeof e.error_description === "string") return e.error_description;
    if (typeof e.details === "string") return e.details;
  }
  return "";
}

function extractCode(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { code?: unknown; status?: unknown };
    if (typeof e.code === "string") return e.code;
    if (typeof e.status === "number") return String(e.status);
  }
  return "";
}
