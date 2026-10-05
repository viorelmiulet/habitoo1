// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { canAccessSuperadmin, orgStatusBadge } from "@/lib/superadmin-status";
import { DetailCard, DetailNotFound, DetailRow } from "@/components/superadmin/SuperadminUi";

vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  Link: ({ children, ...p }: { children: ReactNode }) => <a href={String((p as { to?: string }).to)}>{children}</a>,
}));

describe("SuperAdmin — acces", () => {
  it("doar SuperAdmin intră", () => {
    expect(canAccessSuperadmin({ isSuperadmin: true })).toBe(true);
    expect(canAccessSuperadmin({ isSuperadmin: false })).toBe(false);
    expect(canAccessSuperadmin(null)).toBe(false);
  });
  it("etichetele de stare au culorile cerute", () => {
    expect(orgStatusBadge({ status: "active" }).tone).toBe("success");
    expect(orgStatusBadge({ status: "active", is_trial: true }).label).toBe("În probă");
    expect(orgStatusBadge({ status: "pending_approval" }).tone).toBe("warning");
    expect(orgStatusBadge({ status: "suspended" }).tone).toBe("danger");
    expect(orgStatusBadge({ status: "active", archived_at: "2026-01-01" }).tone).toBe("neutral");
  });
});

describe("SuperAdmin — pagini de detaliu", () => {
  const wrap = (ui: ReactNode) => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
  it("randează cardurile cu date de test", () => {
    const html = wrap(<DetailCard title="Date firmă"><dl><DetailRow label="CUI">RO123</DetailRow></dl></DetailCard>);
    expect(html).toContain("Date firmă");
    expect(html).toContain("RO123");
  });
  it("ID inexistent arată 404 prietenos cu link înapoi", () => {
    const html = wrap(<DetailNotFound title="Agenția nu a fost găsită" to="/superadmin/agencies" label="Înapoi la agenții" />);
    expect(html).toContain("Agenția nu a fost găsită");
    expect(html).toMatch(/href="\/superadmin\/agencies"[^>]*>[\s\S]*Înapoi la agenții/);
  });
});
