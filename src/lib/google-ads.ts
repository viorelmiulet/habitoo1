import { hasConsent } from "@/lib/cookie-consent";
import { isPublicHostname } from "@/lib/host";

/** Eticheta Google Ads (gtag.js) — doar site-ul public, doar cu acord „Marketing”. */
export const GOOGLE_ADS_ID = "AW-18520792187";
export const GOOGLE_ADS_SCRIPT_ID = "google-ads-gtag";
export const GOOGLE_ADS_SRC = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`;

type Gtag = (...args: unknown[]) => void;
type AdsWindow = Window & { dataLayer?: unknown[]; gtag?: Gtag; __habitooAdsConfigured?: boolean };

const AD_KEYS = ["ad_storage", "ad_user_data", "ad_personalization"] as const;
const consentValue = (v: "granted" | "denied") =>
  Object.fromEntries(AD_KEYS.map((k) => [k, v])) as Record<(typeof AD_KEYS)[number], string>;

function ensureGtag(w: AdsWindow): Gtag {
  if (!w.gtag) {
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag() {
      // gtag.js cere obiectul `arguments`, nu un array.
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer!.push(arguments);
    };
    // Consent Mode v2: totul refuzat implicit, înainte de orice altă comandă.
    w.gtag("consent", "default", { ...consentValue("denied"), analytics_storage: "denied" });
  }
  return w.gtag;
}

/** Aplică starea acordului curent. Sigur de apelat de mai multe ori. */
export function syncGoogleAds(hostname: string, w: AdsWindow = window as AdsWindow) {
  if (!isPublicHostname(hostname)) return;
  const granted = hasConsent("marketing");
  const loaded = !!w.document.getElementById(GOOGLE_ADS_SCRIPT_ID);
  if (!granted) {
    // Retragere: doar dacă eticheta a rulat în această sesiune.
    if (w.gtag) w.gtag("consent", "update", consentValue("denied"));
    return;
  }
  const gtag = ensureGtag(w);
  gtag("consent", "update", consentValue("granted"));
  if (!w.__habitooAdsConfigured) {
    w.__habitooAdsConfigured = true;
    gtag("js", new Date());
    gtag("config", GOOGLE_ADS_ID);
  }
  if (!loaded) {
    const s = w.document.createElement("script");
    s.id = GOOGLE_ADS_SCRIPT_ID;
    s.async = true;
    s.src = GOOGLE_ADS_SRC;
    w.document.head.appendChild(s);
  }
}
