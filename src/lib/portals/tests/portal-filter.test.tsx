import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
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

import { PortalFilterOptionsList } from "@/components/app/PortalFilterSelect";

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
    const html = renderToStaticMarkup(
      <PortalFilterOptionsList value="romimo:unpublished" options={options} onSelect={() => {}} />,
    );
    expect(html).toContain("Doar portalurile activate pentru agenția ta.");
    expect(html).toContain("Toate portalurile");
    expect(html).toContain("Publicate pe cel puțin un portal");
    expect(html).toContain('data-testid="logo-stack-romimo" data-size="28"');
    expect(html).toContain('data-testid="logo-stack-properstar"');
    expect(html).not.toContain("logo-stack-imobiliare_ro");
    expect(html).toContain("Publicate (în feed)");
  });
});
