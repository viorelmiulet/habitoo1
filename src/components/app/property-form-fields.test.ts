/**
 * Formularul de proprietate: caracteristicile se completează o singură dată, în
 * „Detalii complete”. Testele citesc sursa ecranelor de adăugare și de editare
 * ca să prindă reapariția unui câmp duplicat (un al doilea input pentru aceeași
 * coloană salvează o valoare care o suprascrie pe cealaltă).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROPERTY_DETAIL_FIELDS } from "@/lib/property-detail-fields";
import { generalFeatureOptions } from "@/lib/property-taxonomy";

const newScreen = readFileSync("src/routes/_authenticated/app.properties.new.tsx", "utf8");
const editScreen = readFileSync("src/routes/_authenticated/app.properties.$id.tsx", "utf8");
const detailsFields = readFileSync("src/components/app/PropertyDetailsFields.tsx", "utf8");

/** Coloanele mutate din secțiunea de tranzacție în „Detalii complete”. */
const movedColumns = [
  "property_type",
  "usable_surface",
  "rooms",
  "bathrooms",
  "floor_label",
  "build_year",
  "features",
] as const;

describe("caracteristicile proprietății", () => {
  it("sunt toate coloane editate din secțiunea de detalii", () => {
    for (const column of movedColumns) {
      expect(PROPERTY_DETAIL_FIELDS).toContain(column);
    }
  });

  it("au fiecare exact un câmp în secțiunea de detalii", () => {
    for (const column of movedColumns) {
      const occurrences = detailsFields.match(new RegExp(`field="${column}"`, "g")) ?? [];
      // `property_type` este un Select scris explicit, nu prin `field="..."`.
      if (column === "property_type") {
        expect(detailsFields).toContain('setField("property_type", v)');
        continue;
      }
      // Etajul are o componentă dedicată (listă + „Număr etaj” la nevoie).
      if (column === "floor_label") {
        expect(detailsFields).toContain("<FloorField ctx={ctx} />");
        expect(detailsFields.match(/<FloorField /g) ?? []).toHaveLength(1);
        continue;
      }
      expect(occurrences).toHaveLength(1);
    }
  });

  it("nu mai sunt randate în ecranul de adăugare în afara secțiunii de detalii", () => {
    for (const column of movedColumns) {
      expect(newScreen).not.toContain(`id="${column}"`);
      expect(newScreen).not.toContain(`form.${column}`);
    }
    // Facilitățile sunt acum o listă din nomenclator, nu o listă locală.
    expect(newScreen).not.toContain("featureOptions");
    expect(generalFeatureOptions.length).toBeGreaterThan(0);
  });

  it("nu mai sunt randate în ecranul de editare în afara secțiunii de detalii", () => {
    for (const column of movedColumns) {
      expect(editScreen).not.toContain(`draft.${column}`);
      expect(editScreen).not.toContain(`["${column}",`);
    }
  });

  it("se salvează prin patch-ul de detalii pe ambele ecrane", () => {
    // Un singur `...details` alimentează insert-ul și update-ul.
    expect(newScreen).toContain("...details,");
    expect(editScreen).toContain("...details,");
  });

  it("păstrează în secțiunea de sus doar tranzacția, prețul și comisionul", () => {
    expect(newScreen).toContain('<FormSection title="Tranzacție și preț"');
    expect(newScreen).not.toContain("Tranzacție, preț și caracteristici");
    const section = newScreen.slice(
      newScreen.indexOf('title="Tranzacție și preț"'),
      newScreen.indexOf('title="Detalii complete"'),
    );
    expect(section).toContain('id="commission"');
    expect(section).toContain("PropertyTransactionFields");
    for (const column of movedColumns) {
      expect(section).not.toContain(`id="${column}"`);
    }
  });

  it("păstrează titlul ca singur câmp obligatoriu al formularului", () => {
    // Nicio regulă de validare nu era atașată câmpurilor mutate.
    expect(newScreen.match(/required/g) ?? []).toHaveLength(1);
    expect(newScreen).toContain('id="title"');
  });
});
