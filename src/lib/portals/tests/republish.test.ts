/** Republicarea anunțurilor deja publicate — fără apeluri reale la portaluri. */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { countByPortal, effectiveRepublishScope, locallyBlockedPairs, selectRepublishPairs, staggerRepublishPairs } from "../republish";
import { republishCountText } from "@/components/app/PortalRepublishDialog";
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

describe("R2: reîncercarea selecțiilor respinse", () => {
  const props = [
    { id: "studio", status: "active", deleted_at: null, assigned_to: "agent-1" },
    { id: "off", status: "active", deleted_at: null, assigned_to: "agent-1" },
    { id: "live", status: "active", deleted_at: null, assigned_to: "agent-1" },
    { id: "pulled", status: "active", deleted_at: null, assigned_to: "agent-1" },
    { id: "local", status: "active", deleted_at: null, assigned_to: "agent-1" },
    { id: "auto", status: "active", deleted_at: null, assigned_to: "agent-1" },
  ];
  const input = {
    scope: "all" as const, userId: "agent-1", portalFilter: null,
    activePortals: new Set(["homedirect", "clickimob"]), properties: props,
    listings: [
      { property_id: "live", portal: "homedirect", status: "published", external_id: "H1" },
      { property_id: "pulled", portal: "homedirect", status: "withdrawn", external_id: null },
    ],
    publications: [
      { property_id: "studio", portal_key: "homedirect", enabled: true, status: "error" },
      { property_id: "off", portal_key: "homedirect", enabled: false, status: "error" },
      { property_id: "live", portal_key: "homedirect", enabled: true, status: "synced" },
      { property_id: "pulled", portal_key: "homedirect", enabled: true, status: "error" },
      { property_id: "local", portal_key: "homedirect", enabled: true, status: "error" },
      { property_id: "auto", portal_key: "clickimob", enabled: true, status: "error" },
    ],
    locallyBlocked: locallyBlockedPairs([
      { property_id: "local", portal: "homedirect", success: false, error_code: "VALIDATION_ERROR", http_status: null },
      { property_id: "studio", portal: "homedirect", success: false, error_code: "VALIDATION_ERROR", http_status: 400 },
    ]),
  };

  it("selectat cu publicare respinsă → reîncercat; deselectat, retras, blocat local și preluare automată → excluse", () => {
    const out = selectRepublishPairs(input);
    expect(out.retry).toEqual([{ propertyId: "studio", portalId: "homedirect" }]);
    expect(out.queued).toEqual([{ propertyId: "live", portalId: "homedirect" }]);
    expect(out.autoPull).toEqual([]);
  });

  it("rezumatul pe portal numără separat", () => {
    expect(countByPortal(selectRepublishPairs(input).retry)).toEqual({ homedirect: 1 });
    expect(republishCountText(2, 25)).toBe("2 anunțuri + 25 de reîncercat");
    expect(republishCountText(1, 0)).toBe("1 anunț");
  });

  const jobAdmin = (rows: Record<string, unknown>) => ({ from: (t: string) => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: rows[t] }) }; return q; } });
  const job = { organization_id: "org", property_id: "studio", portal_key: "homedirect", requested_by: "agent-1" };

  it("worker: selecția respinsă pleacă o dată ca publicare nouă; publicatul rămâne update", async () => {
    const execute = vi.fn(async (_i: { action: string }) => ({ ok: false, message: "HomeDirect a respins datele trimise." }));
    const failed = await runRepublishJob(jobAdmin({ properties: props[0], portal_listings: null, portal_publications: input.publications[0] }), job, execute, { retryFailed: true });
    expect(execute.mock.calls[0]![0]).toMatchObject({ action: "publish" });
    expect(failed.action).toBe("blocked");
    execute.mockClear();
    await runRepublishJob(jobAdmin({ properties: props[2], portal_listings: input.listings[0], portal_publications: input.publications[2] }), { ...job, property_id: "live" }, execute, { retryFailed: true });
    expect(execute.mock.calls[0]![0]).toMatchObject({ action: "update" });
    execute.mockClear();
    const contact = await runRepublishJob(jobAdmin({ properties: props[0], portal_listings: null, portal_publications: input.publications[0] }), job, execute);
    expect(contact.action).toBe("skipped");
    expect(execute).not.toHaveBeenCalled();
  });
});
