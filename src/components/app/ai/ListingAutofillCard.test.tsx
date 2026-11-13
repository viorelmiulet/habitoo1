// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const enabled = { value: false };
vi.mock("@/hooks/use-ai-features", () => ({ useAiFeatures: () => ({ isLoading: false, isEnabled: () => enabled.value }) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@/lib/ai/listing-autofill/autofill.functions", () => ({ autofillListing: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

import { ListingAutofillCard } from "./ListingAutofillCard";

async function render() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => root.render(<QueryClientProvider client={new QueryClient()}>
    <ListingAutofillCard mode="new" photos={[]} onPhotosChange={() => undefined} onProposal={(p) => p} marked={[]} onRemoveField={() => undefined} onAcceptAll={() => undefined} missing={[]} />
  </QueryClientProvider>));
  return el;
}

describe("cardul Completează cu AI", () => {
  it("funcția oprită → cardul și butonul sunt ascunse", async () => {
    enabled.value = false;
    const el = await render();
    expect(el.querySelector("[data-testid=listing-autofill-card]")).toBeNull();
  });
  it("fără poze și fără text/voce → butonul este dezactivat", async () => {
    enabled.value = true;
    const el = await render();
    const button = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Completează cu AI"));
    expect(button?.disabled).toBe(true);
  });
});
