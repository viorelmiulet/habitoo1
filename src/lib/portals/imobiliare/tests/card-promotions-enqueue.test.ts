import { expect, it, vi } from "vitest";
vi.mock("@/lib/portals/publish-schedule.server", () => ({ cancelActiveSchedules: async () => undefined }));
const slots = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: false, message: "Fără locuri" }));
vi.mock("../../slots.server", () => ({ ensurePortalSlotAvailable: slots }));
import { enqueuePublishJobsForOrg } from "../../publish-enqueue.server";
import type { ImobiliarePromotionChanges } from "../card-promotions";
it("keeps explicit promotion choices in the durable job before any portal call", async () => {
  const inserts: Record<string, unknown>[] = [];
  const admin = { from: () => {
    const chain = { select: () => chain, eq: () => chain, insert: async (row: Record<string, unknown>) => { inserts.push(row); return { error: null }; }, then: (resolve: (result: unknown) => unknown) => resolve({ data: [{ portal_key: "imobiliare_ro", enabled: true }] }) };
    return chain;
  }, rpc: async () => ({ error: null }) };
  const result = await enqueuePublishJobsForOrg({ organizationId: "org", actorId: "actor", superadmin: false, data: { propertyId: "property", selections: [{ portalId: "imobiliare_ro", enabled: true, imobiliarePromotions: { tl: true, bonus: false } }], syncExisting: true }, loadAdmin: async () => admin, activatedPortalIds: async () => new Set(["imobiliare_ro"]) });
  expect(result.results[0]?.queued).toBe(true);
  expect(inserts).toHaveLength(1);
  expect(inserts[0]).toMatchObject({ portal_key: "imobiliare_ro", imobiliare_promotions: { tl: true, bonus: false }, requested_by: "actor" });
});
it.each([
  { mode: "imoradar_only" as const, changes: {} as ImobiliarePromotionChanges },
  { mode: "combined" as const, changes: { bonus: true } as ImobiliarePromotionChanges },
])("queues $mode durably despite a refusing local slot gate", async ({ mode, changes }) => {
  slots.mockClear();
  const inserts: Record<string, unknown>[] = [];
  const admin = { from: () => {
    const chain = { select: () => chain, eq: () => chain, insert: async (row: Record<string, unknown>) => { inserts.push(row); return { error: null }; }, then: (resolve: (result: unknown) => unknown) => resolve({ data: [] }) };
    return chain;
  }, rpc: async () => ({ error: null }) };
  const result = await enqueuePublishJobsForOrg({ organizationId: "org", actorId: "actor", superadmin: false, data: { propertyId: "property", selections: [{ portalId: "imobiliare_ro", enabled: true, imobiliareMode: mode, imobiliarePromotions: changes }], syncExisting: true }, loadAdmin: async () => admin, activatedPortalIds: async () => new Set(["imobiliare_ro"]) });
  expect(result.results[0]?.queued).toBe(true);
  expect(inserts[0]).toMatchObject({ imobiliare_mode: mode, imobiliare_promotions: changes });
  expect(slots).not.toHaveBeenCalled();
});