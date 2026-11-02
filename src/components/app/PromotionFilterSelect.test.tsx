// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { PromotionFilterSelect } from "./PromotionFilterSelect";
import { promotionFilterGroups } from "@/lib/portals/promotion-filter";

vi.mock("@/components/app/PortalLogo", () => ({ PortalLogoStack: () => null }));

it("pe aceeași selecție păstrează Orice, prelungirea și două erori", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onChange = vi.fn();
  const value = "any,storia:auto_renew_on,imospot:error";
  try {
    await act(async () => root.render(<PromotionFilterSelect value={value} groups={promotionFilterGroups(new Set(["storia", "imospot", "vdi"]))} onChange={onChange} />));
    const trigger = container.querySelector<HTMLButtonElement>('[role="combobox"]');
    if (!trigger) throw new Error("Lipsește filtrul");
    await act(async () => trigger.click());
    const option = document.body.querySelector<HTMLElement>('[cmdk-item][data-value="vdi:error"]');
    if (!option) throw new Error("Lipsește opțiunea VDI");
    await act(async () => option.click());
    expect(onChange).toHaveBeenCalledWith("any,storia:auto_renew_on,imospot:error,vdi:error");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});