/**
 * Consimțământ cookie-uri pentru site-ul public (habitoo.ro).
 * Preferința se salvează în localStorage; pe *.habitoo.ro se copiază și într-un
 * cookie pe domeniul comun, ca acordul dat pe www să fie valabil pe crm (înscriere).
 */

export const CONSENT_STORAGE_KEY = "habitoo.cookieConsent";
/** Crește versiunea când se schimbă categoriile — bannerul reapare. */
export const CONSENT_VERSION = 2;

export type ConsentCategory = "necessary" | "analytics" | "marketing";

export type ConsentState = {
  version: number;
  date: string;
  necessary: true;
  analytics: boolean;
  marketing: boolean;
};

export const OPEN_PREFERENCES_EVENT = "habitoo:cookie-preferences";
export const CONSENT_CHANGED_EVENT = "habitoo:cookie-consent-changed";

export const CATEGORIES: {
  id: ConsentCategory;
  label: string;
  description: string;
  locked?: boolean;
  empty?: boolean;
}[] = [
  {
    id: "necessary",
    label: "Strict necesare",
    description:
      "Asigură funcționarea site-ului: autentificarea în aplicație, menținerea sesiunii, securitatea formularelor și memorarea acestei preferințe de consimțământ. Nu pot fi dezactivate.",
    locked: true,
  },
  {
    id: "analytics",
    label: "Analiză",
    description:
      "Ne ajută să înțelegem cum este folosit site-ul, în mod agregat. Momentan nu folosim cookie-uri din această categorie; se activează numai cu acordul tău explicit.",
    empty: true,
  },
  {
    id: "marketing",
    label: "Marketing",
    description:
      "Măsurăm eficiența reclamelor noastre Google Ads. Se activează numai cu acordul tău.",
  },
];

function isValid(value: unknown): value is ConsentState {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<ConsentState>;
  return (
    v.version === CONSENT_VERSION &&
    typeof v.analytics === "boolean" &&
    typeof v.marketing === "boolean"
  );
}

export const CONSENT_COOKIE = "habitoo_consent";
const SHARED_DOMAIN = "habitoo.ro";

function sharedCookieDomain(): string | null {
  const h = window.location.hostname.toLowerCase();
  return h === SHARED_DOMAIN || h.endsWith(`.${SHARED_DOMAIN}`) ? SHARED_DOMAIN : null;
}

function readConsentCookie(): unknown {
  const m = window.document.cookie.match(new RegExp(`(?:^|;\\s*)${CONSENT_COOKIE}=([^;]*)`));
  return m ? JSON.parse(decodeURIComponent(m[1]!)) : null;
}

function writeConsentCookie(state: ConsentState) {
  const domain = sharedCookieDomain();
  if (!domain) return;
  window.document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(state))}; Domain=${domain}; Path=/; Max-Age=${180 * 24 * 3600}; SameSite=Lax; Secure`;
}

/** Copiază în cookie-ul comun o preferință salvată înainte doar în localStorage. */
export function shareConsentAcrossSubdomains() {
  if (typeof window === "undefined") return;
  try {
    const state = readConsent();
    if (state && !readConsentCookie()) writeConsentCookie(state);
  } catch {
    /* cookie indisponibil */
  }
}

/** Preferința salvată sau null dacă nu există / versiunea e depășită. */
export function readConsent(): ConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : readConsentCookie();
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Salvează preferința și anunță aplicația printr-un eveniment. */
export function saveConsent(choice: { analytics: boolean; marketing: boolean }): ConsentState {
  const state: ConsentState = {
    version: CONSENT_VERSION,
    date: new Date().toISOString(),
    necessary: true,
    analytics: choice.analytics,
    marketing: choice.marketing,
  };
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* localStorage indisponibil */
  }
  writeConsentCookie(state);
  window.dispatchEvent(new CustomEvent<ConsentState>(CONSENT_CHANGED_EVENT, { detail: state }));
  return state;
}

/**
 * Verificare programatică înainte de a încărca orice script:
 *   if (hasConsent("analytics")) loadAnalytics();
 * Fără consimțământ salvat întoarce false (cookie-urile necesare sunt mereu permise).
 */
export function hasConsent(category: ConsentCategory): boolean {
  if (category === "necessary") return true;
  const state = readConsent();
  return state ? state[category] : false;
}

/** Redeschide panoul de preferințe (link „Preferințe cookie-uri” din footer). */
export function openCookiePreferences() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_PREFERENCES_EVENT));
}
