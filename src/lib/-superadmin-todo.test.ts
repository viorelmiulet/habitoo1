import { describe, expect, it } from "vitest";
import {
  anunturiLabel,
  classifyExpiry,
  groupBlockedPublishing,
  termLabel,
  todoItemCount,
  todoSubtitle,
  zeroCategories,
} from "./superadmin-todo";

const NOW = Date.parse("2026-11-01T21:00:00Z");
const DAY = 86_400_000;
const zero = { pendingRegistrations: 0, pendingSubscriptionRequests: 0, pendingPortalActivations: 0, openTickets: 0, failingConnections: 0 };

describe("De rezolvat", () => {
  it("expiră în cel mult 7 zile = avertisment; 8 zile = nimic; trecut = expirat", () => {
    expect(classifyExpiry(new Date(NOW + 7 * DAY).toISOString(), NOW)).toEqual({ kind: "expiring", daysLeft: 7 });
    expect(classifyExpiry(new Date(NOW + 8 * DAY).toISOString(), NOW)).toBeNull();
    expect(classifyExpiry(new Date(NOW - 3 * DAY).toISOString(), NOW)?.kind).toBe("expired");
    expect(classifyExpiry(null, NOW)).toBeNull();
  });

  it("durata termenului: 30 sau 90 de zile", () => {
    expect(termLabel("trial_30d", true)).toBe("Trial 30 zile");
    expect(termLabel("trial_90d", false)).toContain("90");
    expect(termLabel("30d", false)).toBe("30 de zile");
    expect(termLabel("30d", true)).toBe("Trial 30 de zile");
  });

  it("separă „Oferta nu este publicabilă” de alte erori, pe agenție", () => {
    const g = groupBlockedPublishing(
      [
        { organization_id: "a", last_error: "VDI.ro: Oferta nu este publicabilă: verifică statusul" },
        { organization_id: "a", last_error: "Vumsi a respins datele" },
        { organization_id: "b", last_error: null },
      ],
      (id) => id.toUpperCase(),
    );
    expect(g[0]).toEqual({ organizationId: "a", organizationName: "A", total: 2, notPublishable: 1, other: 1 });
    expect(g[1].other).toBe(1);
  });

  it("numără cardurile și listează categoriile la zero", () => {
    const todo = { counts: { ...zero, openTickets: 2 }, expiring: [], expired: [], blocked: [{ organizationId: "a", organizationName: "A", total: 1, notPublishable: 1, other: 0 }] };
    expect(todoItemCount(todo)).toBe(2);
    expect(zeroCategories(todo.counts)).not.toContain("Tichete de suport");
    expect(zeroCategories(todo.counts)).toHaveLength(4);
    expect(todoItemCount({ counts: zero, expiring: [], expired: [], blocked: [] })).toBe(0);
  });

  it("subtitlul și acordul numeralelor", () => {
    expect(todoSubtitle(new Date(NOW), 2)).toBe("Duminică, 1 noiembrie · 2 lucruri de rezolvat");
    expect(anunturiLabel(42)).toBe("42 de anunțuri");
    expect(anunturiLabel(3)).toBe("3 anunțuri");
  });
});
