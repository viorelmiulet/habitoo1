import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { PortalSlotsCard } from "./PortalSlotsCard";

vi.mock("@tanstack/react-start", async (original) => ({ ...await original<typeof import("@tanstack/react-start")>(), useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/portals/slots.functions", () => ({
  getPortalSlotMatrix: vi.fn(), getPortalSlotAuditTrail: vi.fn(), getPortalSlotWithdrawStatus: vi.fn(),
  previewPortalSlotChange: vi.fn(), setPortalSlotAllocation: vi.fn(), setPortalSlotTotal: vi.fn(),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const clients: QueryClient[] = [];
afterEach(() => { for (const client of clients) client.clear(); clients.length = 0; });

it.each(["homezz", undefined])("filtrează sloturi, istoric și progres doar cu portalId=%s", async (portalId) => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  clients.push(client);
  const portals = [
    { portalId: "homezz", portalName: "HomeZZ.ro", agencyTotal: 30, agencyUsed: 7, cells: [{ userId: "u1", total: 12, used: 7 }] },
    { portalId: "storia", portalName: "Storia.ro", agencyTotal: 50, agencyUsed: 9, cells: [{ userId: "u1", total: 15, used: 9 }] },
  ];
  client.setQueryData(["portal-slot-matrix", "o1"], { portals, users: [{ userId: "u1", name: "Agent" }] });
  client.setQueryData(["portal-slot-trail", "o1"], portals.map((p) => ({ id: p.portalId, portalKey: p.portalId, portalName: p.portalName, actorName: `Administrator ${p.portalId}`, previous: 1, next: 2 })));
  client.setQueryData(["portal-slot-withdraw-status", "o1"], { portalKey: "storia", portalName: "Storia.ro", status: "running", done: 1, total: 2, failed: 0, failures: [] });
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><PortalSlotsCard organizationId="o1" {...(portalId ? { portalId } : {})} /></QueryClientProvider>));
    expect(container.querySelector('input[aria-label="Total locuri HomeZZ.ro"]')?.getAttribute("value")).toBe("30");
    expect(container.querySelector('input[aria-label="Locuri Agent HomeZZ.ro"]')?.getAttribute("value")).toBe("12");
    expect(container.textContent).toContain("Administrator homezz");
    if (portalId) {
      expect(container.querySelector('input[aria-label="Total locuri Storia.ro"]')).toBeNull();
      expect(container.textContent).not.toContain("Administrator storia");
      expect(container.textContent).not.toContain("Se retrag ofertele");
    } else {
      expect(container.querySelector('input[aria-label="Total locuri Storia.ro"]')?.getAttribute("value")).toBe("50");
      expect(container.textContent).toContain("Administrator storia");
      expect(container.textContent).toContain("Se retrag ofertele");
    }
  } finally { await act(async () => root.unmount()); container.remove(); }
});