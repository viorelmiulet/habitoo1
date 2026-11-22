// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { CONSENT_STORAGE_KEY, readConsent, saveConsent } from "@/lib/cookie-consent";
import { readFileSync } from "node:fs";
import { GOOGLE_ADS_SCRIPT_ID, reportSignupConversion, syncGoogleAds } from "@/lib/google-ads";

const w = window as unknown as { dataLayer?: unknown[]; gtag?: unknown; __habitooAdsConfigured?: boolean };
const scripts = () => document.querySelectorAll(`#${GOOGLE_ADS_SCRIPT_ID}`).length;
const calls = () => (w.dataLayer ?? []).map((a) => Array.from(a as ArrayLike<unknown>));

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = "";
  delete w.dataLayer;
  delete w.gtag;
  delete w.__habitooAdsConfigured;
});

describe("Google Ads", () => {
  it("nu se încarcă fără acord pentru marketing", () => {
    saveConsent({ analytics: true, marketing: false });
    syncGoogleAds("www.habitoo.ro");
    expect(scripts()).toBe(0);
  });

  it("cu acord se încarcă o singură dată, cu consent default denied întâi", () => {
    saveConsent({ analytics: false, marketing: true });
    syncGoogleAds("habitoo.ro");
    syncGoogleAds("habitoo.ro");
    expect(scripts()).toBe(1);
    const c = calls();
    expect(c[0][0]).toBe("consent");
    expect(c[0][1]).toBe("default");
    expect(c.filter((x) => x[0] === "config")).toEqual([["config", "AW-18589473467"]]);
  });

  it("pe crm.habitoo.ro nu se încarcă niciodată", () => {
    saveConsent({ analytics: true, marketing: true });
    syncGoogleAds("crm.habitoo.ro");
    expect(scripts()).toBe(0);
    expect(w.dataLayer).toBeUndefined();
  });

  it("retragerea acordului trimite denied", () => {
    saveConsent({ analytics: false, marketing: true });
    syncGoogleAds("www.habitoo.ro");
    saveConsent({ analytics: false, marketing: false });
    syncGoogleAds("www.habitoo.ro");
    const last = calls().at(-1)!;
    expect(last).toEqual([
      "consent",
      "update",
      { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" },
    ]);
  });

  it("consimțământul versiunea 1 nu mai e valid", () => {
    localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ version: 1, date: "2026-01-01", necessary: true, analytics: true, marketing: true }),
    );
    expect(readConsent()).toBeNull();
  });
});

describe("conversia de înscriere", () => {
  const fake = (hostname: string, pathname: string) =>
    ({ document, location: { hostname, pathname } }) as unknown as Window & { dataLayer?: unknown[] };
  const events = (f: { dataLayer?: unknown[] }) => (f.dataLayer ?? []).map((a) => Array.from(a as ArrayLike<unknown>)).filter((x) => x[0] === "event");

  it("pe crm.habitoo.ro eticheta rulează doar pe /register", () => {
    saveConsent({ analytics: false, marketing: true });
    syncGoogleAds("crm.habitoo.ro", fake("crm.habitoo.ro", "/app"), "/app");
    expect(scripts()).toBe(0);
    syncGoogleAds("crm.habitoo.ro", fake("crm.habitoo.ro", "/register"), "/register");
    expect(scripts()).toBe(1);
  });

  it("trimite conversia contului nou cu send_to-ul contului și ID-ul utilizatorului", () => {
    saveConsent({ analytics: false, marketing: true });
    const f = fake("crm.habitoo.ro", "/register");
    expect(reportSignupConversion("user-1", f)).toBe(true);
    expect(events(f)).toEqual([["event", "conversion", { send_to: "AW-18589473467/nDL6CIrqnr0dELu1k6BF", transaction_id: "user-1" }]]);
  });

  it("fără acord „Marketing” nu trimite nimic", () => {
    saveConsent({ analytics: true, marketing: false });
    const f = fake("crm.habitoo.ro", "/register");
    expect(reportSignupConversion("user-1", f)).toBe(false);
    expect(f.dataLayer).toBeUndefined();
    expect(scripts()).toBe(0);
  });

  it("pagina de înscriere raportează doar după crearea contului", () => {
    const src = readFileSync("src/routes/register.tsx", "utf8");
    const i = src.indexOf("reportSignupConversion(data.user.id)");
    expect(i).toBeGreaterThan(src.indexOf("if (existingAccount)"));
    expect(i).toBeGreaterThan(src.indexOf("if (error)"));
  });
});
