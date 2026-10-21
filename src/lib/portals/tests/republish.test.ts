/** Republicarea anunțurilor deja publicate — fără apeluri reale la portaluri. */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { effectiveRepublishScope, selectRepublishPairs, staggerRepublishPairs } from "../republish";
import { runRepublishJob } from "../republish.server";

const base = {
  userId: "agent-1",
  portalFilter: null,
  activePortals: new Set(["storia", "imobiliare_ro", "properstar", "clickimob"]),
  properties: [
    { id: "mine", status: "active", deleted_at: null, assigned_to: "agent-1" },
    { id: "other", status: "active", deleted_at: null, assigned_to: "agent-2" },
    { id: "sold", status: "sold", deleted_at: null, assigned_to: "agent-1" },
    { id: "draft", status: "active", deleted_at: null, assigned_to: "agent-1" },
    { id: "withdrawn", status: "active", deleted_at: null, assigned_to: "agent-1" },
  ],
  listings: [
    { property_id: "mine", portal: "storia", status: "published", external_id: "S1" },
    { property_id: "mine", portal: "properstar", status: "published", external_id: "P1" },
    { property_id: "other", portal: "storia", status: "updated", external_id: "S2" },
    { property_id: "sold", portal: "storia", status: "published", external_id: "S3" },
    { property_id: "draft", portal: "imobiliare_ro", status: "pending", external_id: null },
    { property_id: "withdrawn", portal: "storia", status: "withdrawn", external_id: "S4" },
  ],
  publications: [
    { property_id: "mine", portal_key: "storia", enabled: true },
    { property_id: "mine", portal_key: "properstar", enabled: true },
    { property_id: "other", portal_key: "storia", enabled: true },
    { property_id: "sold", portal_key: "storia", enabled: true },
    { property_id: "draft", portal_key: "imobiliare_ro", enabled: true },
    { property_id: "withdrawn", portal_key: "storia", enabled: false },
  ],
};

describe("republicarea anunțurilor", () => {
  it("agentul nu poate cere toate anunțurile agenției, nici prin server", () => {
    expect(effectiveRepublishScope("all", true)).toBe("mine");
    const src = readFileSync("src/lib/portals/republish.functions.ts", "utf8");
    expect(src).toContain("effectiveRepublishScope(data.scope, org.agentOnly)");
    const { queued } = selectRepublishPairs({ ...base, scope: effectiveRepublishScope("all", true) });
    expect(queued.map((p) => p.propertyId)).not.toContain("other");
  });

  it("adminul poate alege ambele opțiuni", () => {
    expect(effectiveRepublishScope("all", false)).toBe("all");
    expect(effectiveRepublishScope("mine", false)).toBe("mine");
    const { queued } = selectRepublishPairs({ ...base, scope: "all" });
    expect(queued.map((p) => p.propertyId).sort()).toEqual(["mine", "other"]);
  });

  it("nepublicatele, retrasele și vândutele nu intră în job", () => {
    const { queued, autoPull } = selectRepublishPairs({ ...base, scope: "all" });
    const ids = [...queued, ...autoPull].map((p) => p.propertyId);
    for (const id of ["sold", "draft", "withdrawn"]) expect(ids).not.toContain(id);
  });

  it("portalurile cu preluare automată sunt sărite", () => {
    const { queued, autoPull } = selectRepublishPairs({ ...base, scope: "mine" });
    expect(queued).toEqual([{ propertyId: "mine", portalId: "storia" }]);
    expect(autoPull).toEqual([{ propertyId: "mine", portalId: "properstar" }]);
  });

  it("eșalonează trimiterile pe același portal", () => {
    const out = staggerRepublishPairs([{ propertyId: "a", portalId: "storia" }, { propertyId: "b", portalId: "storia" }], 0);
    expect(Date.parse(out[1]!.nextAttemptAt) - Date.parse(out[0]!.nextAttemptAt)).toBe(3000);
  });

  it("apelează doar update (retrimitere), niciodată publish sau withdraw", async () => {
    const rows: Record<string, unknown> = {
      properties: base.properties[0], portal_listings: base.listings[0], portal_publications: base.publications[0],
    };
    const admin = { from: (t: string) => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: rows[t] }) }; return q; } };
    const execute = vi.fn(async (_input: { action: string; operationLabel: string }) => ({ ok: true }));
    const out = await runRepublishJob(admin, { organization_id: "org", property_id: "mine", portal_key: "storia", requested_by: "agent-1" }, execute);
    expect(out.ok).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]![0]).toMatchObject({ action: "update", operationLabel: "republish" });
    rows.portal_listings = base.listings[5];
    execute.mockClear();
    const skipped = await runRepublishJob(admin, { organization_id: "org", property_id: "mine", portal_key: "storia", requested_by: "agent-1" }, execute);
    expect(skipped.action).toBe("skipped");
    expect(execute).not.toHaveBeenCalled();
  });

  it("un al doilea job nu pornește cât rulează primul", () => {
    const src = readFileSync("src/lib/portals/republish.functions.ts", "utf8");
    expect(src).toContain("if (await activeBatch(admin, org.organizationId)) throw");
    expect(src).toContain('"23505"');
    const migration = readFileSync("drizzle/migrations/0152_portal_republish_batches.sql", "utf8");
    expect(migration).toContain("portal_republish_batches_one_active ON public.portal_republish_batches (organization_id) WHERE status = 'running'");
  });
});
