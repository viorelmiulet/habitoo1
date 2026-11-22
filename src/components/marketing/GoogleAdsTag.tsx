import { useEffect } from "react";
import { CONSENT_CHANGED_EVENT, shareConsentAcrossSubdomains } from "@/lib/cookie-consent";
import { syncGoogleAds } from "@/lib/google-ads";

/** Google Ads se încarcă pe habitoo.ro/www.habitoo.ro și pe pagina de înscriere, după acordul „Marketing”. */
export function GoogleAdsTag() {
  useEffect(() => {
    const run = () => syncGoogleAds(window.location.hostname, window, window.location.pathname);
    shareConsentAcrossSubdomains();
    run();
    window.addEventListener(CONSENT_CHANGED_EVENT, run);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, run);
  }, []);
  return null;
}
