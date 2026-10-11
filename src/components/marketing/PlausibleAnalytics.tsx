import { useEffect } from "react";
import { CONSENT_CHANGED_EVENT, hasConsent } from "@/lib/cookie-consent";

const SCRIPT_SRC = "https://plausible.io/js/pa-hn2TBu5_f9R8AnHsLj5Wb.js";
const SCRIPT_ID = "plausible-analytics";

declare global {
  interface Window {
    plausible?: ((...args: unknown[]) => void) & { q?: unknown[]; o?: unknown; init?: (i?: unknown) => void };
  }
}

/**
 * Excluderea domeniilor (ex. crm.habitoo.ro) se face din panoul Plausible,
 * nu din cod — scriptul se încarcă peste tot, după consimțământ.
 */
function loadPlausible() {
  if (document.getElementById(SCRIPT_ID)) return;
  // Stub-ul oficial Plausible: colectează apelurile până se încarcă scriptul.
  const w = window;
  w.plausible =
    w.plausible ||
    function (...args: unknown[]) {
      (w.plausible!.q = w.plausible!.q || []).push(args);
    };
  w.plausible.init = w.plausible.init || function (i?: unknown) { w.plausible!.o = i || {}; };
  w.plausible.init();

  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.async = true;
  script.src = SCRIPT_SRC;
  document.head.appendChild(script);
}

/**
 * Plausible (analiză fără cookie-uri de urmărire) se încarcă NUMAI după
 * consimțământul explicit pentru categoria „Analiză” din bannerul de cookie-uri.
 */
export function PlausibleAnalytics() {
  useEffect(() => {
    if (hasConsent("analytics")) loadPlausible();
    const onConsent = () => {
      if (hasConsent("analytics")) loadPlausible();
    };
    window.addEventListener(CONSENT_CHANGED_EVENT, onConsent);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, onConsent);
  }, []);
  return null;
}
