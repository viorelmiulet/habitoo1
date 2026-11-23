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
  { id: "housera", displayName: "Housera", availability: "available", activated: false, activation: "oauth", connectionStatus: "disconnected", request: null, companyDataMissing: [], houseraConfigured: true, houseraConnected: false, houseraOAuth: null },
  { id: "zup", displayName: "ZUP", availability: "available", activated: false, activation: "oauth", connectionStatus: "disconnected", request: null, companyDataMissing: [], zupConfigured: false, zupConnected: false },
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
  HouseraConnectionControls: () => <button data-housera-mock>Conectează cu Housera</button>,
  useHouseraCallbackToast: () => undefined,
}));
vi.mock("@/components/app/FacebookCatalogCard", () => ({ FacebookCatalogCard: () => null }));
vi.mock("@/components/app/PortalLogo", () => ({
  PortalLogoStack: ({ name }: { name: string }) => <span data-logo>{name}</span>,
}));

import { AgencyPortalCatalogCard } from "./AgencyPortalCatalogCard";
import { TooltipProvider } from "@/components/ui/tooltip";

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
        <TooltipProvider><AgencyPortalCatalogCard /></TooltipProvider>
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

  it("niciun text explicativ sub numele portalului (informația e în tooltip)", async () => {
    await renderCard();
    for (const id of ["imospot", "imo24", "zonata", "housera"]) {
      const li = row(id);
      expect(li.textContent).not.toContain("Cheia API este emisă");
      expect(li.textContent).not.toContain("Aprobarea trebuie dată");
      expect(li.querySelector("div.mt-2")).toBeNull();
    }
    expect(row("imospot").querySelector("[data-portal-info]")).toBeTruthy();
  });

  it("Housera: butonul stă în coloana din dreapta, nu peste logo", async () => {
    await renderCard();
    const li = row("housera");
    const identity = li.querySelector("[data-portal-identity]")!;
    const statuses = li.querySelector("[data-portal-statuses]")!;
    expect(identity.querySelector("[data-housera-mock]")).toBeNull();
    expect(statuses.querySelector("[data-housera-mock]")).toBeTruthy();
    expect(identity.contains(statuses)).toBe(false);
  });

  it("ZUP neconfigurat: insigna Indisponibil, fără buton", async () => {
    await renderCard();
    const statuses = row("zup").querySelector("[data-portal-statuses]")!;
    expect(statuses.textContent).toBe("Indisponibil");
    expect(statuses.querySelector("button, a")).toBeNull();
  });

  it("fiecare rând are aceeași structură: nume + acțiuni pe primul rând", async () => {
    await renderCard();
    for (const id of ["imospot", "imo24", "zonata"]) {
      const li = row(id);
      const headerRow = li.firstElementChild as HTMLElement;
      expect(headerRow.className).toContain("sm:grid-cols-[minmax(0,1fr)_auto]");
      const identity = headerRow.querySelector("[data-portal-identity]")!;
      const statuses = headerRow.querySelector("[data-portal-statuses]")!;
      expect(identity.querySelector("[data-logo]")).toBeTruthy();
      expect(identity.querySelector("p")?.textContent).toBeTruthy();
      expect(statuses.firstElementChild?.className).toContain("rounded-full");
      expect(statuses.querySelector("a, button")?.className).toContain("min-w-44");
    }
  });

  it("pe mobil butoanele ocupă toată lățimea (w-full, restrâns la sm:)", async () => {
    await renderCard();
    const imospotButton = row("imospot").querySelector("[data-portal-statuses] a, [data-portal-statuses] button");
    expect(imospotButton?.className).toContain("w-full");
    expect(imospotButton?.className).toContain("sm:w-auto");
  });
});
