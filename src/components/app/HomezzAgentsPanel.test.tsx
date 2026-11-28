// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomezzAgentsPanel } from "./HomezzAgentsPanel";

vi.mock("@tanstack/react-start", async (original) => ({
  ...await original<typeof import("@tanstack/react-start")>(),
  useServerFn: (fn: unknown) => fn,
}));
vi.mock("@/lib/agency-portal-setup.functions", () => ({
  getHomezzAgents: vi.fn(),
  activateHomezzAgentFn: vi.fn(),
  setHomezzAgentPromotionsFn: vi.fn(),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | null = null;
let client: QueryClient | null = null;
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  client?.clear();
  client = null;
  document.body.innerHTML = "";
});

const contractPromotions = [
  { id: 3, label: "Premium", total: 2, allocated: 0, remaining: 2 },
  { id: 6, label: "Prima Pagină", total: 2, allocated: 1, remaining: 1 },
  { id: 9, label: "Top Listă", total: 2, allocated: 2, remaining: 0 },
  { id: 7, label: "Reînnoire instant", total: 2, allocated: 0, remaining: 2 },
];

function renderRoster() {
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  client.setQueryData(["homezz-agents", "self"], {
    error: null,
    contractPromotions,
    members: [
      {
        userId: "active", name: "Agent activ", email: "activ@example.ro", allocation: 10, active: true,
        assignedSlots: 10, remainingSlots: 8,
        promotions: contractPromotions.map((p) => ({ id: p.id, label: p.label, total: 0, remaining: 0, text: null })),
      },
      {
        userId: "inactive", name: "Agent neactivat", email: "neactivat@example.ro", allocation: null, active: false,
        assignedSlots: null, remainingSlots: null, promotions: [],
      },
    ],
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(<QueryClientProvider client={client!}><HomezzAgentsPanel /></QueryClientProvider>));
  return container;
}

describe("HomezzAgentsPanel", () => {
  it("afișează rezumatul contractului și toate cele patru câmpuri doar la agentul activ", () => {
    const container = renderRoster();
    const summary = container.querySelector("[data-homezz-contract-promotions]");
    expect(summary?.textContent).toContain("Premium 0/2 alocate · Prima Pagină 1/2 alocate · Top Listă 2/2 alocate · Reînnoire instant 0/2 alocate");

    const activeRow = Array.from(container.querySelectorAll("li")).find((li) => li.textContent?.includes("Agent activ"))!;
    const activePromotions = activeRow.querySelector("[data-homezz-agent-promotions]")!;
    expect(activePromotions.querySelectorAll("input")).toHaveLength(4);
    expect(Array.from(activePromotions.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["Salvează", "Salvează", "Salvează", "Salvează"]);

    const inactiveRow = Array.from(container.querySelectorAll("li")).find((li) => li.textContent?.includes("Agent neactivat"))!;
    expect(inactiveRow.querySelector("[data-homezz-agent-promotions]")).toBeNull();
  });
});
