import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..", "..");
const read = (path: string) => readFileSync(join(root, path.replace(/^src\//, "")), "utf8");

describe("cablarea cerințelor pre-publicare", () => {
  it("serverul validează cerințele ÎNAINTE de orice apel către portal", () => {
    const source = read("src/lib/portals.functions.ts");
    const fnStart = source.indexOf("export async function executeListingAction");
    const fnEnd = source.indexOf("export async function", fnStart + 10);
    const body = source.slice(fnStart, fnEnd);
    // Validarea cerințelor rulează înainte de încărcarea adaptorului.
    const reqIndex = body.indexOf("portalRequirementReport");
    const adapterIndex = body.indexOf("getPortalAdapter");
    expect(reqIndex).toBeGreaterThan(-1);
    expect(adapterIndex).toBeGreaterThan(-1);
    expect(reqIndex).toBeLessThan(adapterIndex);
    // Retragerile nu sunt blocate de cerințe (anunțurile publicate nu se retrag automat).
    expect(body).toContain('action !== "withdraw"');
    // Eșecul de validare nu ajunge la portal: se oprește cu VALIDATION_ERROR.
    expect(body).toContain('code: "VALIDATION_ERROR"');
  });

  it("matricea de portaluri expune câmpurile lipsă per celulă", () => {
    const source = read("src/lib/portals.functions.ts");
    expect(source).toContain("missingRequirements: string[]");
    expect(source).toContain("loadRequirementSubjects");
    const matrix = source.slice(source.indexOf("export const getPropertiesPortalMatrix"));
    expect(matrix).toContain("validatePortalRequirements(portal.id, subject)");
  });

  it("fila Publicare dezactivează bifa portalului cu câmpuri lipsă", () => {
    const source = read("src/components/app/PropertyPortalsCard.tsx");
    expect(source).toContain("blockedByRequirements");
    expect(source).toContain("Completează: ");
    // Debifarea nu este blocată niciodată de cerințe.
    expect(source).toContain("missingReqs.length > 0 && !value && !cell.selected");
  });

  it("grila de publicare în masă dezactivează celula cu motivul la hover", () => {
    const source = read("src/components/app/PropertyPublishView.tsx");
    expect(source).toContain("blockedByRequirements");
    expect(source).toContain("Completează: ${missingReqs.join");
  });

  it("salvarea proprietății reîmprospătează cerințele (portalul devine selectabil imediat)", () => {
    const source = read("src/routes/_authenticated/app.properties.$id.tsx");
    expect(source).toContain('queryKey: ["property-portal-requirements"]');
    expect(source).toContain('queryKey: ["property-portals-matrix"]');
  });

  it("încărcarea în lot citește aceleași câmpuri ca încărcarea individuală", () => {
    const source = read("src/lib/portals/requirements.server.ts");
    expect(source).toContain("loadRequirementSubjects");
    // Ambele variante citesc etajul și eticheta lui (regula Imobiliare.ro).
    expect(source.match(/floor_label/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
