/**
 * Traducere prietenoasă a erorilor Supabase Auth.
 * Nu expunem niciodată mesajul tehnic brut utilizatorului final.
 */
export type AuthErrorKind =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "already_registered"
  | "weak_password"
  | "rate_limited"
  | "provider_disabled"
  | "unknown";

export function classifyAuthError(message?: string | null, code?: string | null): AuthErrorKind {
  const m = `${code ?? ""} ${message ?? ""}`.toLowerCase();
  if (m.includes("email not confirmed") || m.includes("email_not_confirmed"))
    return "email_not_confirmed";
  if (m.includes("invalid login credentials") || m.includes("invalid_credentials"))
    return "invalid_credentials";
  if (
    m.includes("already registered") ||
    m.includes("user_already_exists") ||
    m.includes("already been registered")
  )
    return "already_registered";
  if (
    m.includes("password") &&
    (m.includes("weak") || m.includes("short") || m.includes("pwned") || m.includes("at least"))
  )
    return "weak_password";
  if (
    m.includes("rate limit") ||
    m.includes("too many") ||
    m.includes("over_email_send_rate_limit")
  )
    return "rate_limited";
  if (
    m.includes("unsupported provider") ||
    m.includes("provider is not enabled") ||
    m.includes("validation_failed")
  )
    return "provider_disabled";
  return "unknown";
}

const MESSAGES: Record<AuthErrorKind, string> = {
  invalid_credentials:
    "Email sau parolă incorectă. Dacă te-ai înscris cu Google, folosește butonul „Continuă cu Google”.",
  email_not_confirmed:
    "Emailul nu este confirmat încă. Verifică inboxul sau retrimite emailul de confirmare.",
  already_registered: "Există deja un cont cu acest email. Autentifică-te sau resetează parola.",
  weak_password: "Parola este prea slabă. Folosește minim 8 caractere, cu litere și cifre.",
  rate_limited: "Prea multe încercări. Așteaptă câteva minute și încearcă din nou.",
  provider_disabled:
    "Autentificarea Google nu este configurată momentan. Folosește emailul și parola.",
  unknown: "Ceva nu a funcționat. Încearcă din nou în câteva momente.",
};

export function authErrorMessage(message?: string | null, code?: string | null): string {
  return MESSAGES[classifyAuthError(message, code)];
}

export function authKindMessage(kind: AuthErrorKind): string {
  return MESSAGES[kind];
}
