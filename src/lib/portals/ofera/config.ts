export const OFERA_MISSING_MESSAGE = "Credențialele Ofera nu sunt configurate pe server.";
export const OFERA_BASE_URL = "https://admin.ofera.ro/api/v2.1";
export const OFERA_SECRET_NAMES = ["OFERA_CLIENT_ID", "OFERA_CLIENT_SECRET", "OFERA_USERNAME", "OFERA_PASSWORD"] as const;
export function oferaConfigured(env: Record<string, string | undefined>): boolean {
  return OFERA_SECRET_NAMES.every((name) => Boolean(env[name]?.trim()));
}
export function oferaProviderId(value: unknown): number | null {
  const text = String(value ?? "").trim();
  if (!/^[1-9]\d*$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) ? number : null;
}