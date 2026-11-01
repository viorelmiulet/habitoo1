// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/onboarding-tour", () => ({ announceGuideContext: vi.fn() }));

import { GlobalSearch } from "./GlobalSearch";

afterEach(cleanup);

describe("GlobalSearch Ctrl+K", () => {
  it("opens exactly one dialog with both variants mounted; one Escape closes it", async () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <GlobalSearch />
        <GlobalSearch compact />
      </QueryClientProvider>,
    );
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    });
    expect(document.querySelectorAll('[role="dialog"]').length).toBe(1);
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    });
    expect(document.querySelectorAll('[role="dialog"]').length).toBe(0);
  });
});
