/**
 * Teste pentru filtrul „Promovare” din lista de proprietăți:
 * opțiuni din registru (doar portaluri conectate), potrivirea stărilor locale
 * (doar servicii pornite, doar anunțuri publicate), „Fără promovare”,
 * etichetele din listă și izolarea pe agenție a funcțiilor de server.
 * Fără apeluri reale la portaluri.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  parsePromotionSelection,
  promotionBadgesFor,
  promotionFilterGroups,
  promotionSelectionIsEmpty,
  promotionStateActive,
  propertyHasAnyPromotion,
  propertyMatchesPromotion,
  type PropertyPromotionInfo,
} from "@/lib/portals/promotion-filter";
import { buildPromotionInfos } from "@/lib/portals/promotion-filter.functions";
import { manageableImobiliarePromotions } from "@/lib/portals/imobiliare/promotions";
import { PORTALS } from "@/lib/portals/registry";
import { parsePromotionValues, serializePromotionValues, togglePromotionValue } from "@/components/app/PromotionFilterSelect";

const info = (partial: Partial<PropertyPromotionInfo>): PropertyPromotionInfo => ({
  imobiliarePublished: false,
  imobiliareActiveServices: [],
  flagPromotions: [],
  ...partial,
});

describe("promotionFilterGroups", () => {
  it("include serviciile Imobiliare.ro gestionabile doar când portalul e conectat", () => {
    const groups = promotionFilterGroups(new Set(["imobiliare_ro"]));
    const imobiliare = groups.find((g) => g.portalId === "imobiliare_ro");
    expect(imobiliare).toBeDefined();
    const expected = manageableImobiliarePromotions().map((p) => p.id);
    expect(imobiliare!.options.map((o) => o.value)).toEqual(expected.map((id) => `imobiliare_ro:${id}`));
    // Toate serviciile gestionabile au writeField (se pot porni din Habitoo).
    expect(expected.length).toBeGreaterThan(0);
  });

  it("nu include Imobiliare.ro când portalul nu e conectat", () => {
    const groups = promotionFilterGroups(new Set(["romimo"]));
    expect(groups.find((g) => g.portalId === "imobiliare_ro")).toBeUndefined();
  });

  it("include „Promovat” pentru portalurile cu supports_promoted_flag, doar dacă sunt conectate", () => {
    const flagPortals = PORTALS.filter((p) => p.supports_promoted_flag === true).map((p) => p.id);
    expect(flagPortals).toContain("romimo");
    const connected = promotionFilterGroups(new Set(flagPortals));
    for (const portalId of flagPortals) {
      const group = connected.find((g) => g.portalId === portalId);
      expect(group, portalId).toBeDefined();
      expect(group!.options).toEqual([{ value: `${portalId}:promoted`, label: "Promovat" }]);
    }
    // Neconectat → nu apare.
    const notConnected = promotionFilterGroups(new Set(["imobiliare_ro"]));
    for (const portalId of flagPortals) {
      expect(notConnected.find((g) => g.portalId === portalId)).toBeUndefined();
    }
  });

  it("se construiește din registru: orice portal cu flag apare automat", () => {
    // Simulăm un portal nou cu flag adăugat în registru.
    const fakeConnected = new Set(PORTALS.filter((p) => p.supports_promoted_flag).map((p) => p.id));
    const groups = promotionFilterGroups(fakeConnected);
    expect(groups.length).toBe(PORTALS.filter((p) => p.supports_promoted_flag === true).length);
  });
});

describe("parsePromotionSelection", () => {
  it("parsează valorile separate prin virgulă și ignoră necunoscutele", () => {
    const selection = parsePromotionSelection("imobiliare_ro:tl, romimo:promoted, bogus, imobiliare_ro:bonus");
    expect(selection.imobiliareServices).toEqual(["tl", "bonus"]);
    expect(selection.flagPortals).toEqual(["romimo"]);
    expect(selection.any).toBe(false);
    expect(selection.none).toBe(false);
  });

  it("recunoaște any/none și deduplică", () => {
    const selection = parsePromotionSelection("any,imobiliare_ro:tl,imobiliare_ro:tl");
    expect(selection.any).toBe(true);
    expect(selection.imobiliareServices).toEqual(["tl"]);
    expect(promotionSelectionIsEmpty(parsePromotionSelection(""))).toBe(true);
  });
});

describe("promotionStateActive", () => {
  it("contează doar true sau valoare > 0", () => {
    expect(promotionStateActive(true, null)).toBe(true);
    expect(promotionStateActive(null, 2.5)).toBe(true);
    expect(promotionStateActive(false, null)).toBe(false);
    expect(promotionStateActive(null, 0)).toBe(false);
    expect(promotionStateActive(null, null)).toBe(false);
  });
});

describe("propertyMatchesPromotion", () => {
  const tlActive = info({ imobiliarePublished: true, imobiliareActiveServices: ["tl"] });
  const bonusActive = info({ imobiliarePublished: true, imobiliareActiveServices: ["bonus"] });
  const romimoPromoted = info({
    flagPromotions: [{ portalId: "romimo", published: true, promoted: true }],
  });
  const plain = info({ imobiliarePublished: true });

  it("filtrul Top Listing potrivește doar anunțurile cu Top Listing pornit", () => {
    const selection = parsePromotionSelection("imobiliare_ro:tl");
    expect(propertyMatchesPromotion(tlActive, selection)).toBe(true);
    expect(propertyMatchesPromotion(bonusActive, selection)).toBe(false);
    expect(propertyMatchesPromotion(plain, selection)).toBe(false);
    expect(propertyMatchesPromotion(romimoPromoted, selection)).toBe(false);
  });

  it("serviciile multiple se combină cu SAU", () => {
    const selection = parsePromotionSelection("imobiliare_ro:tl,imobiliare_ro:bonus");
    expect(propertyMatchesPromotion(tlActive, selection)).toBe(true);
    expect(propertyMatchesPromotion(bonusActive, selection)).toBe(true);
    expect(propertyMatchesPromotion(plain, selection)).toBe(false);
  });

  it("„Orice promovare” include Imobiliare și flag-ul de portal", () => {
    const selection = parsePromotionSelection("any");
    expect(propertyMatchesPromotion(tlActive, selection)).toBe(true);
    expect(propertyMatchesPromotion(romimoPromoted, selection)).toBe(true);
    expect(propertyMatchesPromotion(plain, selection)).toBe(false);
  });

  it("„Fără promovare” exclude anunțurile promovate", () => {
    const selection = parsePromotionSelection("none");
    expect(propertyMatchesPromotion(plain, selection)).toBe(true);
    expect(propertyMatchesPromotion(tlActive, selection)).toBe(false);
    expect(propertyMatchesPromotion(romimoPromoted, selection)).toBe(false);
  });

  it("flag-ul de portal contează doar pe anunțuri publicate", () => {
    const selection = parsePromotionSelection("romimo:promoted");
    expect(propertyMatchesPromotion(romimoPromoted, selection)).toBe(true);
    expect(
      propertyMatchesPromotion(
        info({ flagPromotions: [{ portalId: "romimo", published: false, promoted: true }] }),
        selection,
      ),
    ).toBe(false);
  });

  it("selecția goală nu filtrează nimic", () => {
    expect(propertyMatchesPromotion(plain, parsePromotionSelection(""))).toBe(true);
  });
});

describe("buildPromotionInfos", () => {
  it("contează doar serviciile pornite pe anunțuri publicate", () => {
    const infos = buildPromotionInfos({
      listings: [
        { property_id: "p1", portal: "imobiliare_ro", status: "published" },
        { property_id: "p2", portal: "imobiliare_ro", status: "withdrawn" },
        { property_id: "p3", portal: "imobiliare_ro", status: "updated" },
      ],
      states: [
        { property_id: "p1", promotion_id: "tl", value_boolean: true, value_numeric: null },
        { property_id: "p2", promotion_id: "tl", value_boolean: true, value_numeric: null },
        { property_id: "p3", promotion_id: "energy", value_boolean: null, value_numeric: 0 },
      ],
      publications: [],
    });
    expect(infos.get("p1")?.imobiliareActiveServices).toEqual(["tl"]);
    // p2 are stare activă, dar anunțul e retras → nu contează.
    expect(infos.get("p2")?.imobiliareActiveServices ?? []).toEqual([]);
    // p3 are valoarea 0 (oprit) → nu contează, dar rămâne publicat.
    expect(infos.get("p3")?.imobiliarePublished).toBe(true);
    expect(infos.get("p3")?.imobiliareActiveServices).toEqual([]);
  });

  it("flag-ul promovat contează doar cu publicare activă pe portal", () => {
    const infos = buildPromotionInfos({
      listings: [{ property_id: "p1", portal: "romimo", status: "published" }],
      states: [],
      publications: [
        { property_id: "p1", portal_key: "romimo", enabled: true, promoted: true },
        { property_id: "p2", portal_key: "romimo", enabled: true, promoted: true },
      ],
    });
    expect(propertyHasAnyPromotion(infos.get("p1")!)).toBe(true);
    expect(propertyHasAnyPromotion(infos.get("p2")!)).toBe(false);
  });
});

describe("promotionBadgesFor", () => {
  it("eticheta conține portalul și serviciul", () => {
    const badges = promotionBadgesFor(
      info({
        imobiliarePublished: true,
        imobiliareActiveServices: ["tl"],
        flagPromotions: [{ portalId: "romimo", published: true, promoted: true }],
      }),
    );
    expect(badges.map((b) => b.label)).toEqual(["Imobiliare.ro · Top Listing", "Romimo.ro · Promovat"]);
  });

  it("fără promovări active → fără etichete", () => {
    expect(promotionBadgesFor(info({ imobiliarePublished: true }))).toEqual([]);
  });
});

describe("togglePromotionValue", () => {
  it("any/none sunt exclusive față de servicii", () => {
    expect(togglePromotionValue(["imobiliare_ro:tl"], "any")).toEqual(["any"]);
    expect(togglePromotionValue(["any"], "imobiliare_ro:tl")).toEqual(["imobiliare_ro:tl"]);
    expect(togglePromotionValue(["none"], "romimo:promoted")).toEqual(["romimo:promoted"]);
  });

  it("serviciile se combină și se pot deselecta", () => {
    expect(togglePromotionValue(["imobiliare_ro:tl"], "imobiliare_ro:bonus")).toEqual([
      "imobiliare_ro:tl",
      "imobiliare_ro:bonus",
    ]);
    expect(togglePromotionValue(["imobiliare_ro:tl"], "imobiliare_ro:tl")).toEqual([]);
  });

  it("serializarea e stabilă și deduplicată", () => {
    expect(serializePromotionValues(["a", "a", "b"])).toBe("a,b");
    expect(parsePromotionValues("a,b")).toEqual(["a", "b"]);
  });
});

describe("funcțiile de server", () => {
  const source = readFileSync(
    new URL("../promotion-filter.functions.ts", import.meta.url),
    "utf8",
  );

  it("toate cele trei funcții cer autentificare și agenția din sesiune", () => {
    expect(source.match(/requireActiveOrgAuth/g)?.length).toBeGreaterThanOrEqual(3);
    expect(source.match(/resolvePublishingOrg/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("nu face nicio scriere pe portaluri (doar citire)", () => {
    expect(source).not.toMatch(/setImobiliareListingPromotion|publish|withdraw/i);
  });
});
