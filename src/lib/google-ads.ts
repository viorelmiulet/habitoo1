import { hasConsent } from "@/lib/cookie-consent";
import { isCrmHostname, isPublicHostname } from "@/lib/host";

/** Eticheta Google Ads (gtag.js) a contului „Habitoo CRM” — site public + pagina de înscriere, doar cu acord „Marketing”. */
export const GOOGLE_ADS_ID = "AW-18589473467";
/** Conversia „Înscriere probă gratuită” (SIGNUP, una per clic). */
export const SIGNUP_CONVERSION_SEND_TO = "AW-18589473467/nDL6CIrqnr0dELu1k6BF";
export const REGISTER_PATH = "/register";

/** Unde poate rula eticheta: site-ul public sau pagina de înscriere din CRM. */
export function adsAllowed(hostname: string, pathname: string): boolean {
  return isPublicHostname(hostname) || (isCrmHostname(hostname) && pathname === REGISTER_PATH);
}
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
export function syncGoogleAds(hostname: string, w: AdsWindow = window as AdsWindow, pathname = "/") {
  if (!adsAllowed(hostname, pathname)) return;
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
    gtag("set", "developer_id.dZjgwMW", true);
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

/**
 * Trimite conversia de înscriere după crearea reușită a contului (formularul cu email).
 * Doar cu acord „Marketing” și doar unde eticheta are voie; `userId` evită dublurile.
 */
export function reportSignupConversion(userId: string, w: AdsWindow = window as AdsWindow): boolean {
  if (!adsAllowed(w.location.hostname, w.location.pathname) || !hasConsent("marketing")) return false;
  syncGoogleAds(w.location.hostname, w, w.location.pathname);
  w.gtag?.("event", "conversion", { send_to: SIGNUP_CONVERSION_SEND_TO, transaction_id: userId });
  return true;
}
