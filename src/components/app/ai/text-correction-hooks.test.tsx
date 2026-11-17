// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("@/hooks/use-ai-features", () => ({ useAiFeatures: () => ({ isLoading: false, isEnabled: () => true }) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@/lib/ai/text-correction/correction.functions", () => ({ correctListingText: {} }));
import { TextCorrectionControl } from "./TextCorrectionControl";

describe("CR11 TextCorrectionControl", () => {
  it("nu pică (React #310) când titlul trece din gol în completat", () => {
    const errors: unknown[] = [];
    const div = document.createElement("div");
    const root = createRoot(div, { onUncaughtError: (e) => errors.push(e) });
    const qc = new QueryClient();
    const view = (v: string) => <QueryClientProvider client={qc}><TextCorrectionControl field="title" value={v} onApply={() => {}} /></QueryClientProvider>;
    act(() => root.render(view("")));
    act(() => root.render(view("A")));
    expect(errors).toEqual([]);
    expect(div.textContent).toContain("Corectează textul");
  });
});
