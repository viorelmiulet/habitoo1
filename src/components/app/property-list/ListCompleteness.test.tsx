// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { computeCompleteness, completenessInputFromRow } from "@/lib/property-completeness";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { ListCompletenessCell } from "./ListCompleteness";

let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => { if (root) act(() => root?.unmount()); root = null; });

describe("coloana Fișă = Grad de completare din fișă (CR17)", () => {
  it("fără copertă, 3 poze, fără contract și clasă energetică", () => {
    const row = {
      property_type: "apartment", title: "Apartament 2 camere", for_sale: true, for_rent: false,
      sale_price: 100000, city: "București", assigned_to: "u1", usable_surface: 55,
      description: "x".repeat(400), rooms: 2, energy_class: null, lat: 44.4, lng: 26.1,
    };
    const extra = { hasCover: false, imageCount: 3, hasContract: false };
    const expected = computeCompleteness(completenessInputFromRow(row, extra)).percent;
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root?.render(<ListCompletenessCell row={row} extra={extra} />));
    const cell = host.querySelector('[data-testid="list-completeness"]')!;
    expect(cell.textContent).toBe(`${expected}%`);
    expect(cell.getAttribute("title")).toContain("Fotografie de copertă");
  });
});
