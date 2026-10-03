/**
 * @vitest-environment jsdom
 *
 * Verifică cerința: în lista „Portaluri imobiliare" (portalList) instrucțiunile
 * de conectare sunt mereu vizibile, fără element pliabil; în Promovare rămâne
 * meniul pliabil.
 */
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { overview } = vi.hoisted(() => ({
  overview: {
    state: "connected" as const,
    hasToken: true,
    feedUrl: "https://example.test/api/public/catalog/v1/facebook.csv?token=abc",
    hasLegacySiteToken: false,
    included: 5,
    excluded: { no_price: 0, no_coordinates: 0, no_images: 0, no_city: 0 },
    excludedTotal: 0,
    excludedItems: [] as { id: string; reference: string | null; title: string; reason: "no_price" }[],
    lastReadAt: null,
    agentsCanManage: false,
  },
}));

vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useServerFn: () => async () => overview };
});

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function mount(portalList: boolean) {
  const { FacebookCatalogCard } = await import("@/components/app/FacebookCatalogCard");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={qc}>
        <FacebookCatalogCard portalList={portalList} />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await qc.fetchQuery({ queryKey: ["facebook-catalog-overview"], queryFn: () => overview });
  });
  return { container, root };
}

const STEPS = [
  "Deschide Meta Commerce Manager.",
  "Creează un catalog de tip „Home listings”.",
  "Mergi la Surse de date → Feed de date → URL programat.",
  "Lipește adresa feed-ului de mai sus.",
  "Alege citirea zilnică și salvează.",
];

describe("Catalog Facebook — instrucțiuni de conectare", () => {
  it("în lista de portaluri nu există element pliabil și textul „Details”", async () => {
    const { container, root } = await mount(true);
    expect(container.querySelectorAll("details").length).toBe(0);
    expect(container.querySelectorAll("summary").length).toBe(0);
    expect(container.textContent).not.toContain("Details");
    expect(container.textContent).toContain("Cum îl conectez la Meta");
    for (const step of STEPS) expect(container.textContent).toContain(step);
    expect(container.textContent).toContain("Deschide Meta Commerce Manager");
    root.unmount();
  });

  it("în Promovare rămâne meniul pliabil, cu titlul clicabil", async () => {
    const { container, root } = await mount(false);
    const details = container.querySelector("details") as HTMLDetailsElement;
    expect(details).toBeTruthy();
    expect(details.open).toBe(false);
    const summary = details.querySelector("summary") as HTMLElement;
    expect(summary.textContent).toContain("Cum îl conectez la Meta");
    await act(async () => {
      summary.click();
    });
    expect(details.open).toBe(true);
    root.unmount();
  });
});
