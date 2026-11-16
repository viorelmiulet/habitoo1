import { describe, it, expect } from "vitest";
import { shouldRewithdrawInactive } from "../withdraw-retry";

describe("IM8 shouldRewithdrawInactive", () => {
  it("imobiliare_ro withdrawn + external_id → retrage", () => {
    expect(shouldRewithdrawInactive({ portalId: "imobiliare_ro", listingStatus: "withdrawn", externalId: "X1" })).toBe(true);
  });
  it("alt portal withdrawn → sare", () => {
    expect(shouldRewithdrawInactive({ portalId: "vumsi", listingStatus: "withdrawn", externalId: "X1" })).toBe(false);
  });
  it("fără external_id → sare", () => {
    expect(shouldRewithdrawInactive({ portalId: "imobiliare_ro", listingStatus: "withdrawn", externalId: null })).toBe(false);
  });
  it("imoradar_only activ → nu atinge", () => {
    expect(shouldRewithdrawInactive({ portalId: "imobiliare_ro", listingStatus: "withdrawn", externalId: "X1", publicationEnabled: true, publicationMode: "imoradar_only" })).toBe(false);
  });
});
