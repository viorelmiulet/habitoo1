import { useEffect } from "react";
import { CONSENT_CHANGED_EVENT } from "@/lib/cookie-consent";
import { syncGoogleAds } from "@/lib/google-ads";

/** Google Ads se încarcă numai pe habitoo.ro/www.habitoo.ro, după acordul „Marketing”. */
export function GoogleAdsTag() {
  useEffect(() => {
    const run = () => syncGoogleAds(window.location.hostname);
    run();
    window.addEventListener(CONSENT_CHANGED_EVENT, run);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, run);
  }, []);
  return null;
}
