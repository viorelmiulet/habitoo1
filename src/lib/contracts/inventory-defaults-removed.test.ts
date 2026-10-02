import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("inventar implicit eliminat", () => {
  it("Setări → Agenție nu mai conține secțiunea", () => {
    const s = read("src/routes/_authenticated/app.settings.tsx");
    expect(s).not.toContain("InventoryDefaultsCard");
    expect(s).not.toContain("Inventar implicit");
  });
  it("contractul nou pornește cu anexa goală", () => {
    const s = read("src/components/app/contracts/NewContractDialog.tsx");
    expect(s).not.toContain("getContractInventoryDefaults");
    expect(s).not.toContain("DEFAULT_INVENTORY_ITEMS");
    expect(s).toContain("setInventory([])");
  });
  it("funcțiile server au dispărut, editarea per contract rămâne", () => {
    const s = read("src/lib/contracts.functions.ts");
    expect(s).not.toMatch(/ContractInventoryDefaults/);
    expect(s).not.toContain("contract_inventory_defaults");
    expect(s).toMatch(/inventory/i);
  });
});
