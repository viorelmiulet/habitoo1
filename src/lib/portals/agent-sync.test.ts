import { beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_SYNC_WARNING_PREFIX, resetAgentSyncCache, withRepublishAgentSync, type AgentSyncDeps } from "./agent-sync";
import type { PublishJobRow } from "./publish-jobs.server";

const job = (id: string, portal = "imobiliare_ro"): PublishJobRow => ({
  id, organization_id: "org", property_id: `p-${id}`, portal_key: portal, enabled: true, promoted: null,
  sync_existing: true, requested_by: "u", superadmin: false, attempts: 1, operation: "republish", republish_batch_id: "b1",
});

describe("RP2 agent sync la republicare", () => {
  beforeEach(() => resetAgentSyncCache());

  it("sincronizează agentul înaintea anunțului, o singură dată pentru 3 anunțuri", async () => {
    const order: string[] = [];
    const sync = vi.fn(async () => { order.push("sync"); return { ok: true as const }; });
    const deps: AgentSyncDeps = { syncers: { imobiliare_ro: sync }, loadAgentIds: async () => ["a1"], log: vi.fn(async () => {}) };
    const apply = vi.fn(async (j: PublishJobRow) => { order.push(`apply:${j.id}`); return { portalId: j.portal_key, ok: true, message: null }; });
    for (const id of ["1", "2", "3"]) await withRepublishAgentSync(job(id), apply, deps);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(order[0]).toBe("sync");
    expect(apply).toHaveBeenCalledTimes(3);
    expect(deps.log).toHaveBeenCalledTimes(1);
  });

  it("eșecul agentului nu blochează anunțul și lasă avertisment", async () => {
    const deps: AgentSyncDeps = {
      syncers: { imobiliare_ro: async () => ({ ok: false, message: "HTTP 500" }) },
      loadAgentIds: async () => ["a1"], log: async () => {},
    };
    const apply = vi.fn(async () => ({ portalId: "imobiliare_ro", ok: true, action: "updated", message: null }));
    const out = await withRepublishAgentSync(job("1"), apply, deps);
    expect(apply).toHaveBeenCalled();
    expect(out?.ok).toBe(true);
    expect(out?.message).toBe(`${AGENT_SYNC_WARNING_PREFIX}HTTP 500`);
  });

  it("portalurile fără entitate de agent nu sincronizează", async () => {
    const loadAgentIds = vi.fn(async () => ["a1"]);
    const apply = vi.fn(async () => null);
    await withRepublishAgentSync(job("1", "storia"), apply, { syncers: { imobiliare_ro: vi.fn() }, loadAgentIds, log: async () => {} });
    expect(loadAgentIds).not.toHaveBeenCalled();
  });
});

describe("RP2 contact inline (Storia)", () => {
  it("payload-ul folosește telefonul curent al agentului", async () => {
    const { mapPropertyToStoria } = await import("./storia/mapper");
    const row = {
      id: "11111111-1111-1111-1111-111111111111", title: "Apartament 3 camere Cotroceni", description: "x".repeat(120),
      property_type: "apartment", transaction_kind: "sale", status: "active", publish_status: "published", deleted_at: null,
      for_sale: true, for_rent: false, sale_price: 129000, sale_currency: "EUR", currency: "EUR", rooms: 3, usable_surface: 78,
      lat: 44.43, lng: 26.06, location_precise: true, county: "București", city: "București", reference: "HBT-7", negotiable: false,
    } as never;
    const images = [{ id: "i1", is_primary: true, position: 0, is_confidential: false, include_in_publish: true, url: "https://cdn.test/i1.jpg" }] as never;
    const res = mapPropertyToStoria(row, { baseUrl: "https://crm.habitoo.ro", images, agent: { full_name: "Ana", email: "ana@test.ro", phone: "0733111222" } as never });
    expect(JSON.stringify(res)).toContain("\"phone\":\"0733111222\"");
    expect(JSON.stringify(res)).not.toContain("0722333444");
  });
});
