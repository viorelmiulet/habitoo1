// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AgencyStatsTable } from "./AgencyStatsTable";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@tanstack/react-router", () => ({ Link: ({ to, params, children, ...props }: any) => <a href={to.replace("$id", params.id)} {...props}>{children}</a> }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/superadmin-stats.functions", () => ({ getAgencyStats: vi.fn(), getAgencyAgentStats: vi.fn() }));
vi.mock("@/lib/portals/registry", () => ({ getPortalDefinition: () => null }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ isLoading: false, data: {
  agencies: [{ id: "A", name: "A", listings_active: 1, listings_total: 1, listings_by_status: { active: 1 }, portals: [], status: "active", plan: "basic" }],
  inactiveAgencies: [{ id: "S", name: "S", inactive_reason: "suspended", users_total: 1, listings_total: 2 },
    { id: "E", name: "E", inactive_reason: "expired", users_total: 1, listings_total: 3 },
    { id: "C", name: "C", inactive_reason: "cancelled", users_total: 1, listings_total: 4 }],
  totals: { agencies_active: 1, agencies_trial: 0, users_active: 1, listings_active: 1, listings_published: 1, leads_30d: 1, agencies_new_30d: 1 },
} }) }));
const containers: HTMLDivElement[] = [];
afterEach(() => containers.splice(0).forEach((c) => c.remove()));
it("tabul implicit prezintă A; tabul inactiv prezintă S E C și căutarea nu deschide agenții", async () => {
  const container = document.createElement("div"); document.body.append(container); containers.push(container);
  const root = createRoot(container);
  await act(async () => root.render(<AgencyStatsTable />));
  expect([...container.querySelectorAll("tbody a")].map((a) => a.textContent)).toEqual(["A"]);
  const tab = [...container.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent === "Expirate / suspendate (3)");
  expect(tab).toBeDefined();
  await act(async () => { tab?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })); tab?.click(); });
  expect([...container.querySelectorAll("tbody a")].map((a) => a.textContent)).toEqual(["S", "E", "C"]);
  expect(container.querySelector('button[aria-label="Agenții din S"]')).toBeNull();
  expect([...container.querySelectorAll("tbody tr")].map((r) => r.querySelectorAll("td")[1]?.textContent)).toEqual(["Suspendată", "Expirată", "Anulată"]);
  const search = container.querySelector("input");
  await act(async () => {
    if (search) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, "E"); search.dispatchEvent(new Event("input", { bubbles: true })); }
  });
  expect([...container.querySelectorAll("tbody a")].map((a) => a.textContent)).toEqual(["E"]);
  await act(async () => root.unmount());
});