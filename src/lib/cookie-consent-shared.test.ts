// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.habitoo.ro/"}
import { beforeEach, describe, expect, it } from "vitest";
import { CONSENT_COOKIE, CONSENT_STORAGE_KEY, readConsent, saveConsent, shareConsentAcrossSubdomains } from "@/lib/cookie-consent";

beforeEach(() => { localStorage.clear(); document.cookie = `${CONSENT_COOKIE}=; Domain=habitoo.ro; Path=/; Max-Age=0`; });

describe("acord comun www ↔ crm", () => {
  it("salvarea scrie și cookie-ul de pe habitoo.ro, citit când lipsește localStorage", () => {
    saveConsent({ analytics: false, marketing: true });
    expect(document.cookie).toContain(`${CONSENT_COOKIE}=`);
    localStorage.clear();
    expect(readConsent()?.marketing).toBe(true);
  });
  it("refuzul ajunge și el în cookie", () => {
    saveConsent({ analytics: false, marketing: true });
    saveConsent({ analytics: false, marketing: false });
    localStorage.clear();
    expect(readConsent()?.marketing).toBe(false);
  });
  it("acordul vechi din localStorage este copiat în cookie", () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ version: 2, date: "2026-11-01", necessary: true, analytics: false, marketing: true }));
    shareConsentAcrossSubdomains();
    localStorage.clear();
    expect(readConsent()?.marketing).toBe(true);
  });
});
