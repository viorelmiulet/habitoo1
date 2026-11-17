// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function render(el: React.ReactElement) { const d = document.createElement("div"); document.body.innerHTML = ""; document.body.appendChild(d); act(() => { createRoot(d).render(el); }); return d; }

vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock("@/components/app/PortalLogo", () => ({ PortalLogo: () => null }));
vi.mock("@/lib/portals.functions", () => ({ getPropertiesPortalMatrix: vi.fn() }));

import { PropertySheetHeader } from "./PropertySheetHeader";
import { PublishSummaryView } from "./PropertyPublishSummaryCard";
import { sheetCompleteness } from "@/lib/property-sheet-completeness";

describe("CR10 fișa proprietății", () => {
  it("antetul arată procentul din sheetCompleteness", () => {
    const sheet = { floor: 2, surface: 60, rooms: null, features: [], propertyType: "apartment" };
    const pct = sheetCompleteness(sheet);
    const d = render(<PropertySheetHeader reference="RF-1" title="Apartament" sheet={sheet} />);
    expect(d.querySelector("[data-testid=sheet-completeness]")?.getAttribute("aria-label")).toBe(`Fișă completă ${pct}%`);
    expect(pct).toBeLessThan(100);
  });

  it("cardul Publicare arată N din M selectate (doar portaluri active)", () => {
    const cells = [
      { portalId: "a", portalName: "A", availability: "available", selected: true, state: "published" },
      { portalId: "b", portalName: "B", availability: "available", selected: false, state: "not_selected" },
      { portalId: "c", portalName: "C", availability: "available", selected: true, state: "error" },
      { portalId: "d", portalName: "D", availability: "coming_soon", selected: false, state: "coming_soon" },
    ];
    const d = render(<PublishSummaryView cells={cells} onOpenAll={() => {}} />);
    expect(d.textContent).toContain("2 din 3 selectate");
    expect(d.textContent).toContain("eroare");
    expect(d.textContent).not.toContain("D");
  });
});
