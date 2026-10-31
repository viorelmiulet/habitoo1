import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("./agentii.index.tsx", import.meta.url), "utf8");
const content = readFileSync(
  new URL("../components/marketing/partner-agencies-content.ts", import.meta.url),
  "utf8",
);

describe("pagina publică a agențiilor partenere", () => {
  it("nu afișează text de așteptare", () => {
    expect(route).not.toContain("va apărea în curând");
    expect(route).not.toContain("în curând");
    expect(content).not.toContain("în curând");
  });

  it("explică concret programul de parteneriat", () => {
    for (const phrase of [
      "Un singur sistem pentru portofoliu și clienți",
      "Anunțuri publicate pe portaluri dintr-un singur loc",
      "Colaborare cu alte agenții din platformă",
      "Ceri de la proprietari și potriviri automate",
      "Piața analizată din date reale, nu din estimări",
    ]) {
      expect(content).toContain(phrase);
    }
  });

  it("spune explicit cum apare o agenție în listă", () => {
    expect(content).toContain("Cont activ sau în perioada de probă");
    expect(content).toContain("Fără cerere de înscriere și fără taxă");
    expect(content).toContain("Pagină proprie de profil, opțională");
    expect(content).toContain("Datele de contact nu se publică");
    expect(content).toContain("Agenția poate cere scoaterea din listă");
  });

  it("păstrează lista agențiilor și linkul spre profilul public", () => {
    expect(route).toContain("listPublicPartners");
    expect(route).toContain("partners.map");
    expect(route).toContain("PartnerCard");
    expect(route).toContain('to="/agentii/$slug"');
  });

  it("are un mesaj concret și când lista e goală", () => {
    expect(route).toContain("Lista se completează pe măsură ce agențiile își deschid contul în Habitoo.");
    expect(route).toContain('to="/contact"');
  });

  it("păstrează schema de colecție și indexarea condiționată", () => {
    expect(route).toContain('"@type": "CollectionPage"');
    expect(route).toContain('"@type": "ItemList"');
    expect(route).toContain("noindex: partners.length === 0");
  });
});
