// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { CONSENT_STORAGE_KEY, readConsent, saveConsent } from "@/lib/cookie-consent";
import { GOOGLE_ADS_SCRIPT_ID, syncGoogleAds } from "@/lib/google-ads";

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
    expect(c.filter((x) => x[0] === "config")).toEqual([["config", "AW-18520792187"]]);
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
