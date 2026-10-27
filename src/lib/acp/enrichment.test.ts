import { describe, expect, it } from "vitest";
import { ACP_ENRICH_MONTHLY_BUDGET_USD, parseEnrichResponse, redactListingText, usableEnrichment, type AcpEnrichmentRow } from "./enrichment";
import { runAcpAnalysis, type AcpCandidate } from "./engine";

const row = (over: Partial<AcpEnrichmentRow> = {}): AcpEnrichmentRow => ({
  status: "ok", complex_name: "Militari Residence", complex_confidence: 0.9, condition: "bloc_nou", condition_confidence: 0.9,
  real_property_type: "garsoniera", real_property_type_confidence: 0.9, rooms: null, rooms_confidence: 0, floor: 2, floor_confidence: 0.8,
  price_suspect: false, price_suspect_confidence: 0.9, price_suspect_reason: null, price_suspect_kind: null, ...over,
});

describe("îmbogățire AI ACP", () => {
  it("scoate telefoane, emailuri și nume, păstrează prețurile", () => {
    const out = redactListingText("Contact: Ion Popescu 0722 123 456, ion@x.ro, preț 76 500 €, 55 mp");
    expect(out).not.toMatch(/Popescu|0722|ion@x/);
    expect(out).toContain("76 500");
  });
  it("folosește câmpurile doar cu încredere ≥ 0,7 și doar unde originalul lipsește", () => {
    const use = usableEnrichment(row({ complex_confidence: 0.69, floor_confidence: 0.7 }), { rooms: null, floor: null, condition: null })!;
    expect(use.complexName).toBeNull();
    expect(use.floor).toBe(2);
    expect(use.rooms).toBe(1); // garsonieră = 1 cameră
    expect(use.condition).toBe("nou");
    expect(usableEnrichment(row(), { rooms: 2, floor: 5, condition: "renovat" })).toMatchObject({ rooms: null, floor: null, condition: null });
  });
  it("prețul suspect exclude doar cu tip clar și încredere ≥ 0,7", () => {
    expect(usableEnrichment(row({ price_suspect: true, price_suspect_kind: "chirie_la_vanzare", price_suspect_reason: "chirie" }), {})!.priceSuspectReason).toBe("chirie");
    expect(usableEnrichment(row({ price_suspect: true, price_suspect_kind: "altul" }), {})!.priceSuspectReason).toBeNull();
    expect(usableEnrichment(row({ price_suspect: true, price_suspect_kind: "avans", price_suspect_confidence: 0.6 }), {})!.priceSuspectReason).toBeNull();
  });
  it("motorul v4 exclude comparabilul cu preț suspect", () => {
    const t = { price: 70000, usableArea: 50, rooms: 2, propertyType: "apartment" };
    const c: AcpCandidate = { key: "a", sourceType: "portal", sourceName: "x", title: "t", subject: { ...t, price: 500 }, priceSuspect: "chirie la vânzare" };
    const r = runAcpAnalysis(t, [c], {}, { engineVersion: 4 });
    expect(r.comparables[0]!.isSelected).toBe(false);
    expect(r.comparables[0]!.selectionReason).toContain("preț suspect");
  });
  it("respinge JSON invalid și acceptă elementele valide", () => {
    expect(parseEnrichResponse("nu e json").ok).toBe(false);
    const ok = parseEnrichResponse('```json\n{"anunturi":[{"ref":"a1","complex":null,"complex_incredere":0,"stare":null,"stare_incredere":0,"tip_real":"apartament","tip_real_incredere":1,"camere":2,"camere_incredere":1,"etaj":null,"etaj_incredere":0,"pret_suspect":false,"pret_suspect_incredere":1,"pret_suspect_tip":null,"pret_suspect_motiv":null}]}\n```');
    expect(ok.items.get("a1")?.camere).toBe(2);
  });
  it("plafonul lunar este 5 $", () => expect(ACP_ENRICH_MONTHLY_BUDGET_USD).toBe(5));
});
