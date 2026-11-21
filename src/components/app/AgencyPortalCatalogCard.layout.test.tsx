// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const catalogRows = [
  {
    id: "imospot",
    displayName: "Imospot.ro",
    availability: "available",
    activated: false,
    activation: "approval",
    connectionStatus: "disconnected",
    request: null,
    companyDataMissing: [],
  },
  {
    id: "imo24",
    displayName: "imo24.ro",
    availability: "available",
    activated: false,
    activation: "self_service",
    connectionStatus: "disconnected",
    request: null,
    companyDataMissing: [],
  },
  {
    id: "zonata",
    displayName: "ZonaTa.ro",
    availability: "available",
    activated: true,
    activation: "approval",
    connectionStatus: "connected",
    request: null,
    companyDataMissing: [],
  },
];

vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    Link: ({ to, children, className, ...rest }: Record<string, unknown>) =>
      React.createElement("a", { href: String(to), className: className as string, ...rest }, children as React.ReactNode),
  };
});
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));
vi.mock("@/lib/portal-activation.functions", () => ({
  getAgencyPortalCatalog: async () => catalogRows,
  selfActivatePortal: async () => ({}),
}));
vi.mock("@/lib/portals/storia.functions", () => ({ startStoriaAuthorization: async () => ({ url: "" }) }));
vi.mock("@/lib/portals/olx.functions", () => ({ startOlxAuthorization: async () => ({ url: "" }) }));
vi.mock("@/lib/portals/zup.functions", () => ({
  startZupAuthorization: async () => ({ url: "" }),
  revokeZupAuthorization: async () => ({}),
  testZupAuthorization: async () => ({ ok: true, message: "" }),
}));
vi.mock("@/hooks/use-session", () => ({
  useCurrentUser: () => ({ data: { organization: { id: "org-1" } } }),
}));
vi.mock("@/components/app/StoriaAccountControls", () => ({ StoriaAccountControls: () => null }));
vi.mock("@/components/app/HouseraConnectionControls", () => ({
  HouseraConnectionControls: () => null,
  useHouseraCallbackToast: () => undefined,
}));
vi.mock("@/components/app/FacebookCatalogCard", () => ({ FacebookCatalogCard: () => null }));
vi.mock("@/components/app/PortalLogo", () => ({
  PortalLogoStack: ({ name }: { name: string }) => <span data-logo>{name}</span>,
}));

import { AgencyPortalCatalogCard } from "./AgencyPortalCatalogCard";

let root: ReturnType<typeof createRoot> | null = null;

async function renderCard() {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root?.render(
      <QueryClientProvider client={client}>
        <AgencyPortalCatalogCard />
      </QueryClientProvider>,
    );
  });
  // aștept încărcarea catalogului
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function row(id: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-portal-card='${id}']`);
  if (!el) throw new Error(`rândul ${id} lipsește`);
  return el;
}

describe("rândurile din lista de portaluri (Setări)", () => {
  it("numele portalului nu se rupe și nu se strânge (toate rândurile)", async () => {
    await renderCard();
    for (const id of ["imospot", "imo24", "zonata"]) {
      const name = row(id).querySelector("p");
      expect(name?.textContent).toBe(row(id).querySelector("[data-logo]")?.textContent);
      expect(name?.className).toContain("whitespace-nowrap");
      expect(name?.className).toContain("shrink-0");
    }
  });

  it("textul explicativ Imospot stă sub rândul cu numele, nu în coloana butonului", async () => {
    await renderCard();
    const li = row("imospot");
    const statuses = li.querySelector("[data-portal-statuses]");
    expect(statuses).toBeTruthy();
    // butonul rămâne în coloana din dreapta
    expect(statuses?.textContent).toContain("Solicită activarea");
    expect(statuses?.textContent).not.toContain("Cheia API este emisă");
    // textul explicativ e un bloc separat, după rândul nume + buton
    const headerRow = li.firstElementChild;
    const textBlock = li.querySelector("[data-imospot-sent], div.mt-2");
    expect(headerRow).toBeTruthy();
    expect(textBlock).toBeTruthy();
    expect(headerRow!.contains(textBlock)).toBe(false);
    expect(textBlock!.textContent).toContain("Cheia API este emisă de Imospot");
    // ordinea în document: întâi rândul cu numele, apoi textul
    expect(
      headerRow!.compareDocumentPosition(textBlock!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("fiecare rând are aceeași structură: nume + acțiuni pe primul rând", async () => {
    await renderCard();
    for (const id of ["imospot", "imo24", "zonata"]) {
      const li = row(id);
      const headerRow = li.firstElementChild as HTMLElement;
      expect(headerRow.className).toContain("sm:flex-row");
      expect(headerRow.querySelector("[data-portal-statuses]")).toBeTruthy();
      expect(headerRow.querySelector("[data-logo]")).toBeTruthy();
    }
  });

  it("pe mobil butoanele ocupă toată lățimea (w-full, restrâns la sm:)", async () => {
    await renderCard();
    const imospotButton = row("imospot").querySelector("[data-portal-statuses] a, [data-portal-statuses] button");
    expect(imospotButton?.className).toContain("w-full");
    expect(imospotButton?.className).toContain("sm:w-auto");
  });
});
