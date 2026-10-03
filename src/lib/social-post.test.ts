import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildSocialPostText,
  defaultPhotoSelection,
  showAiRewrite,
  socialHashtags,
  togglePhotoSelection,
  CATALOG_ROW_REASON_LABEL,
  type SocialPostData,
} from "@/lib/social-post";
import { isImageFeedEligible } from "@/lib/site-feed/mapper";

const full: SocialPostData = {
  propertyType: "apartment",
  transactionKind: "sale",
  rooms: 2,
  district: "Militari Residence",
  city: "București",
  floor: 3,
  usableSurface: 55,
  features: ["Balcon", "Centrală proprie"],
  price: 76500,
  currency: "EUR",
  agentName: "Ana Pop",
  agentPhone: "+40722000111",
};

describe("șablonul de text", () => {
  it("Facebook: date reale + hashtag-uri", () => {
    const t = buildSocialPostText("facebook", full);
    expect(t).toContain("Apartament 2 camere de vânzare în Militari Residence, București");
    expect(t).toContain("Etaj 3");
    expect(t).toContain("Suprafață utilă 55 m²");
    expect(t).toContain("Balcon");
    expect(t).toContain("+40722000111");
    expect(t).toContain("#militariresidence #apartamentdevanzare #bucuresti");
  });
  it("Instagram mai scurt, cu hashtag-uri", () => {
    const ig = buildSocialPostText("instagram", full);
    expect(ig.length).toBeLessThan(buildSocialPostText("facebook", full).length + 1);
    expect(ig).toContain("#apartamentdevanzare");
  });
  it("WhatsApp fără hashtag-uri", () => {
    expect(buildSocialPostText("whatsapp", full)).not.toContain("#");
  });
  it("câmpurile lipsă lipsesc din text", () => {
    const t = buildSocialPostText("facebook", {
      ...full, rooms: null, district: null, floor: null, usableSurface: null, features: [], price: null, agentPhone: null,
    });
    expect(t).not.toMatch(/Etaj|m²|Dotări|Preț|vizionare|camere|undefined|null/);
    expect(t).toContain("Apartament de vânzare în București");
  });
  it("parter și închiriere", () => {
    const t = buildSocialPostText("facebook", { ...full, floor: 0, transactionKind: "rent" });
    expect(t).toContain("Parter");
    expect(socialHashtags({ ...full, transactionKind: "rent" })).toContain("#apartamentdeinchiriat");
  });
});

describe("selecția pozelor", () => {
  const ids = Array.from({ length: 14 }, (_, i) => `p${i}`);
  it("implicit primele 5", () => expect(defaultPhotoSelection(ids)).toEqual(ids.slice(0, 5)));
  it("maximum 10, în ordinea selecției", () => {
    let s: string[] = [];
    for (const id of ids) s = togglePhotoSelection(s, id);
    expect(s).toEqual(ids.slice(0, 10));
    s = togglePhotoSelection(s, "p2");
    s = togglePhotoSelection(s, "p12");
    expect(s.at(-1)).toBe("p12");
    expect(s).not.toContain("p2");
  });
  it("confidențialele și nepublicabilele sunt excluse (aceeași regulă ca feed-ul)", () => {
    expect(isImageFeedEligible({ include_in_publish: true, is_confidential: true } as never)).toBe(false);
    expect(isImageFeedEligible({ include_in_publish: false, is_confidential: false } as never)).toBe(false);
    const fn = readFileSync("src/lib/property-promotion.functions.ts", "utf8");
    expect(fn).toContain('.eq("include_in_publish", true)');
    expect(fn).toContain('.eq("is_confidential", false)');
  });
});

describe("butonul AI", () => {
  it("apare doar cu marketing AI activat pe agenție", () => {
    expect(showAiRewrite(() => true)).toBe(true);
    expect(showAiRewrite(() => false)).toBe(false);
    const c = readFileSync("src/components/app/PropertyPromotionTab.tsx", "utf8");
    expect(c).toContain("showAiRewrite(isEnabled) ?");
  });
});

describe("rândul de catalog", () => {
  it("motivele au etichete", () => {
    expect(CATALOG_ROW_REASON_LABEL.not_published).toBe("anunțul nu e publicat");
    expect(Object.keys(CATALOG_ROW_REASON_LABEL)).toEqual([
      "no_price", "no_coordinates", "no_images", "no_city", "not_published",
    ]);
  });
  it("serverul refolosește regulile feed-ului, doar pentru acest anunț, fără token", () => {
    const fn = readFileSync("src/lib/property-promotion.functions.ts", "utf8");
    expect(fn).toContain("loadFacebookCatalogInput(supabaseAdmin, p.organization_id, true, [p.id])");
    expect(fn).toContain("buildFacebookCatalogCsv");
    expect(fn).not.toMatch(/site_feed_tokens|token/i);
  });
});
