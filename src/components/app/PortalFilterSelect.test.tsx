// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortalFilterOptionsList } from "./PortalFilterSelect";
import { propertyListSearchSchema, propertyListStateFromSearch, propertyListSearchFromState } from "@/lib/property-list-filters";
import { parsePromotionSelection, propertyMatchesPromotion } from "@/lib/portals/promotion-filter";

vi.mock("@/components/app/PortalLogo", () => ({ PortalLogoStack: () => null }));

const options = [{ portalId: "imobiliare_ro", name: "Imobiliare.ro", pushSupported: true }];
const groups = [{ portalId: "imobiliare_ro", portalName: "Imobiliare.ro", options: [
  { value: "imobiliare_ro:tl", label: "Top Listing" },
  { value: "imobiliare_ro:bonus", label: "Bonus" },
] }];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function choose(value: string) {
  const option = container.querySelector(`[cmdk-item][data-value="promotion:${value}"]`);
  if (!(option instanceof HTMLElement)) throw new Error(`Missing promotion ${value}`);
  await act(async () => option.click());
}

describe("promovări din lista comună de portaluri", () => {
  it("alegerea Top Listing filtrează numai proprietățile publicate cu serviciul pornit", async () => {
    const onPromotionChange = vi.fn();
    await act(async () => root.render(<PortalFilterOptionsList value="all" options={options} promotionGroups={groups} onSelect={() => {}} onPromotionChange={onPromotionChange} />));
    await choose("imobiliare_ro:tl");
    expect(onPromotionChange).toHaveBeenCalledWith("imobiliare_ro:tl");
    const selection = parsePromotionSelection(onPromotionChange.mock.calls[0]?.[0] ?? "");
    const rows = [
      { id: "published-tl", imobiliarePublished: true, imobiliareActiveServices: ["tl"], flagPromotions: [] },
      { id: "unpublished-tl", imobiliarePublished: false, imobiliareActiveServices: ["tl"], flagPromotions: [] },
      { id: "published-bonus", imobiliarePublished: true, imobiliareActiveServices: ["bonus"], flagPromotions: [] },
    ];
    expect(rows.filter((row) => propertyMatchesPromotion(row, selection)).map((row) => row.id)).toEqual(["published-tl"]);
  });

  it("păstrează selecțiile existente și permite deselectarea serviciului", async () => {
    const onPromotionChange = vi.fn();
    await act(async () => root.render(<PortalFilterOptionsList value="all" options={options} promotionGroups={groups} promotionValue="imobiliare_ro:tl" onSelect={() => {}} onPromotionChange={onPromotionChange} />));
    await choose("imobiliare_ro:bonus");
    expect(onPromotionChange).toHaveBeenLastCalledWith("imobiliare_ro:tl,imobiliare_ro:bonus");
    await choose("imobiliare_ro:tl");
    expect(onPromotionChange).toHaveBeenLastCalledWith("");
  });

  it("Oricare resetează împreună portalul și promovările", async () => {
    const onReset = vi.fn();
    const onSelect = vi.fn();
    await act(async () => root.render(<PortalFilterOptionsList value="imobiliare_ro:published" options={options} promotionGroups={groups} promotionValue="imobiliare_ro:tl" onSelect={onSelect} onReset={onReset} />));
    const option = container.querySelector('[cmdk-item][data-value="all"]');
    if (!(option instanceof HTMLElement)) throw new Error("Missing reset option");
    await act(async () => option.click());
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("URL-ul vechi de promovare păstrează filtrarea și celelalte filtre", () => {
    const old = propertyListStateFromSearch(propertyListSearchSchema.parse({ promotion: "imobiliare_ro:tl", city: "București", page: 2 }));
    expect(old.filters.promotion).toBe("imobiliare_ro:tl");
    expect(old.filters.portal).toBe("all");
    expect(propertyListSearchFromState(old.filters, old.sort, old.page, old.view)).toMatchObject({ promotion: "imobiliare_ro:tl", city: "București", page: 2 });
    const selection = parsePromotionSelection(old.filters.promotion);
    expect(propertyMatchesPromotion({ imobiliarePublished: true, imobiliareActiveServices: ["tl"], flagPromotions: [] }, selection)).toBe(true);
    expect(propertyMatchesPromotion({ imobiliarePublished: false, imobiliareActiveServices: ["tl"], flagPromotions: [] }, selection)).toBe(false);
  });
});