// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  matchesPortalFilter,
  parsePortalFilter,
  portalStateBucket,
  type PortalSelectionState,
} from "@/lib/portals/portal-state";

vi.mock("@/components/app/PortalLogo", () => ({
  PortalLogoStack: ({ portalId, size }: { portalId: string; size: number }) => (
    <span data-testid={`logo-stack-${portalId}`} data-size={size} />
  ),
}));

import { PortalFilterSelect } from "@/components/app/PortalFilterSelect";

describe("maparea stărilor", () => {
  it("published/in_feed → Publicate, error → Cu erori, restul → Nepublicate", () => {
    expect(portalStateBucket("published")).toBe("published");
    expect(portalStateBucket("in_feed")).toBe("published");
    expect(portalStateBucket("error")).toBe("error");
    const rest: PortalSelectionState[] = [
      "not_selected", "selected", "syncing", "withdrawn", "expired", "not_configured", "coming_soon",
    ];
    for (const s of rest) expect(portalStateBucket(s)).toBe("unpublished");
  });

  it("parsează valorile filtrului", () => {
    expect(parsePortalFilter("all")).toBeNull();
    expect(parsePortalFilter("romimo:error")).toEqual({ portal: "romimo", state: "error" });
    expect(parsePortalFilter("any:published")).toEqual({ portal: "any", state: "published" });
  });
});

describe("grupul Toate portalurile", () => {
  const cells = (a: PortalSelectionState, b: PortalSelectionState) => [
    { portalId: "romimo", state: a },
    { portalId: "properstar", state: b },
  ];
  it("Publicate = cel puțin unul publicat/în feed", () => {
    expect(matchesPortalFilter(cells("in_feed", "not_selected"), { portal: "any", state: "published" })).toBe(true);
    expect(matchesPortalFilter(cells("selected", "withdrawn"), { portal: "any", state: "published" })).toBe(false);
  });
  it("Nepublicate = niciunul publicat", () => {
    expect(matchesPortalFilter(cells("selected", "error"), { portal: "any", state: "unpublished" })).toBe(true);
    expect(matchesPortalFilter(cells("published", "error"), { portal: "any", state: "unpublished" })).toBe(false);
  });
  it("Cu erori = cel puțin unul în eroare", () => {
    expect(matchesPortalFilter(cells("published", "error"), { portal: "any", state: "error" })).toBe(true);
    expect(matchesPortalFilter(cells("published", "selected"), { portal: "any", state: "error" })).toBe(false);
  });
  it("portal anume", () => {
    expect(matchesPortalFilter(cells("error", "in_feed"), { portal: "romimo", state: "error" })).toBe(true);
    expect(matchesPortalFilter(cells("error", "in_feed"), { portal: "properstar", state: "published" })).toBe(true);
  });
});

describe("PortalFilterSelect", () => {
  const options = [
    { portalId: "romimo", name: "Publi24 + Romimo", pushSupported: true },
    { portalId: "properstar", name: "Properstar", pushSupported: false },
  ];
  it("afișează doar portalurile activate, fiecare cu PortalLogoStack", () => {
    globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
    Element.prototype.scrollIntoView ??= () => {};
    render(<PortalFilterSelect value="all" options={options} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Publicare pe portaluri" }));
    expect(screen.getByText("Doar portalurile activate pentru agenția ta.")).toBeTruthy();
    expect(screen.getByText("Publicate pe cel puțin un portal")).toBeTruthy();
    expect(screen.getByTestId("logo-stack-romimo").dataset.size).toBe("28");
    expect(screen.getByTestId("logo-stack-properstar")).toBeTruthy();
    expect(screen.queryByTestId("logo-stack-imobiliare_ro")).toBeNull();
    expect(screen.getByText("Publicate (în feed)")).toBeTruthy();
  });
});
