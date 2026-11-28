import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ImobiliarePromotionsAdminCard } from "./ImobiliarePromotionsAdminCard";

vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useQuery: () => ({ data: { available: false, message: "Indisponibil", services: [] }, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() }),
}));
vi.mock("@/lib/portals/promotions/promotion-admin.functions", () => ({
  getImobiliarePromotionAdmin: {},
  previewImobiliarePromotionWithdrawals: {},
  setImobiliarePromotionAllocation: {},
  setImobiliarePromotionCap: {},
  setImobiliarePromotionService: {},
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it.each([true, false])("varianta embedded=%s păstrează titlul și elimină doar cardul exterior", async (embedded) => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ImobiliarePromotionsAdminCard embedded={embedded} />));
    expect(container.textContent).toContain("Promovări Imobiliare.ro");
    expect(Boolean(container.querySelector('[data-slot="card"]'))).toBe(!embedded);
    expect(Boolean(container.querySelector("[data-imobiliare-promotions-admin]"))).toBe(embedded);
  } finally { await act(async () => root.unmount()); container.remove(); }
});
