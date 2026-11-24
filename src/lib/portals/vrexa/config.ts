/** Vrexa.ro: configurare de platformă (pură, fără secrete în cod). */
export type VrexaEnv = "test" | "production";
type Env = Record<string, string | undefined>;

export const VREXA_TEST_URL = "https://test.vrexa.ro";
export const VREXA_TIMEOUT_MS = 30_000;
export const VREXA_NO_PRODUCTION_URL = "Adresa de producție Vrexa nu este configurată (VREXA_PRODUCTION_URL); nu s-a trimis nicio cerere.";

/** Implicit `test`; doar valoarea exactă `production` activează producția. */
export function vrexaEnv(env: Env): VrexaEnv {
  return env["VREXA_ENV"]?.trim().toLowerCase() === "production" ? "production" : "test";
}

/** Mediul salvat pe conexiune (`settings.vrexa_env`), altfel cel din secret. */
export function vrexaConnectionEnv(settings: unknown, env: Env): VrexaEnv {
  const s = settings && typeof settings === "object" ? (settings as Record<string, unknown>) : {};
  const saved = s["vrexa_env"];
  return saved === "production" || saved === "test" ? saved : vrexaEnv(env);
}

/** Baza HTTPS pentru mediu sau `null` (producție fără adresă validă). */
export function vrexaBaseUrl(mode: VrexaEnv, env: Env): string | null {
  if (mode === "test") return VREXA_TEST_URL;
  const raw = env["VREXA_PRODUCTION_URL"]?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    return u.origin + u.pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function vrexaEnvLabel(mode: VrexaEnv): string {
  return mode === "production" ? "producție" : "test";
}
