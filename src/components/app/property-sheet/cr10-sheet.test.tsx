// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function render(el: React.ReactElement) { const d = document.createElement("div"); document.body.innerHTML = ""; document.body.appendChild(d); act(() => { createRoot(d).render(el); }); return d; }

vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));

import { PropertySheetHeader } from "./PropertySheetHeader";
import { computeCompleteness, completenessInputFromRow } from "@/lib/property-completeness";

describe("CR10 fișa proprietății", () => {
  it("antetul arată procentul real, egal cu cardul Grad de completare", () => {
    const row = {
      property_type: "apartment", title: "Apartament 2 camere", for_sale: true, for_rent: false,
      sale_price: 90000, rent_price: null, city: "Cluj-Napoca", assigned_to: "agent-1",
      usable_surface: 54, land_surface: null, description: null, rooms: 2, energy_class: null,
      lat: null, lng: null,
    };
    const pct = computeCompleteness(completenessInputFromRow(row, { hasCover: false, imageCount: 3 })).percent;
    const d = render(<PropertySheetHeader reference="RF-1" title="Apartament 2 camere" percent={pct} />);
    expect(d.querySelector("[data-testid=sheet-completeness]")?.getAttribute("aria-label")).toBe(`Fișă completă ${pct}%`);
    expect(pct).toBeLessThan(100);
    expect(pct).toBeGreaterThan(0);
  });

});
