/**
 * Linkul complet de feed, oferit o singură dată la generarea cheii.
 * Verificăm comportamentul: portalurile „pull” primesc URL complet, celelalte
 * nu; iar linkul se construiește doar din cheia în clar, care nu se stochează.
 */
import { describe, expect, it } from "vitest";
import { CRM_URL } from "@/lib/host";
import { getPortalDefinition, portalPublicFeedUrl } from "@/lib/portals/registry";
import { generatePortalKey, hashPortalKey } from "@/lib/portals/keys.server";

describe("linkul de feed la generarea cheii", () => {
  it("Properstar primește URL complet cu cheia în clar, o singură dată în URL", () => {
    const generated = generatePortalKey("properstar");
    const url = portalPublicFeedUrl("properstar", generated.key);
    expect(url).toBe(`${CRM_URL}/api/public/feed/properstar/${generated.key}.xml`);
    const occurrences = url!.split(generated.key).length - 1;
    expect(occurrences).toBe(1);
  });

  it("un portal fără feed public nu primește URL", () => {
    expect(portalPublicFeedUrl("imobiliare_ro", "oarecare")).toBeNull();
    expect(portalPublicFeedUrl("portal-inexistent", "oarecare")).toBeNull();
    expect(getPortalDefinition("imobiliare_ro")?.public_feed_path_template).toBeUndefined();
  });

  it("din rândul stocat (hash + prefix) URL-ul complet nu poate fi reconstituit", () => {
    const generated = generatePortalKey("properstar");
    const stored = { key_prefix: generated.prefix, key_hash: generated.hash };
    expect(stored.key_hash).toBe(hashPortalKey(generated.key));
    expect(stored.key_hash).not.toContain(generated.key);
    expect(stored.key_prefix).not.toBe(generated.key);
    // Prefixul singur produce un link incomplet, nefolosibil ca acces.
    const fromStored = portalPublicFeedUrl("properstar", stored.key_prefix);
    expect(fromStored).not.toContain(generated.key);
  });
});
