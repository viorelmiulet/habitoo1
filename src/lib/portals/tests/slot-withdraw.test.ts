import { describe, expect, it } from "vitest";

import { planSlotWithdrawals, SLOT_LIMIT_WITHDRAW_REASON, type SlotListing } from "@/lib/portals/slots";
import {
  enqueuePortalSlotWithdrawals,
  loadPortalSlotListings,
  planPortalSlotWithdrawals,
  processPortalSlotWithdrawJob,
  SLOT_WITHDRAW_ARM_FAILED_MESSAGE,
} from "@/lib/portals/slot-withdraw.server";
import { LACHEIE_WITHDRAW_REASON, shouldResendLaCheiePublication } from "@/lib/portals/lacheie/resend";

/* ------------------------------ fake Supabase ------------------------------ */

type Rows = Record<string, Record<string, unknown>[]>;

function fakeAdmin(rows: Rows, options: { armError?: string; rpc?: Record<string, unknown> } = {}) {
  const updates: { table: string; patch: Record<string, unknown>; id: unknown }[] = [];
  const inserted: { table: string; rows: Record<string, unknown>[] }[] = [];
  const rpcCalls: string[] = [];
  let sequence = 0;

  function builder(table: string) {
    const filters: { column: string; value: unknown }[] = [];
    let order: { column: string; ascending: boolean } | null = null;
    const api: Record<string, unknown> = {};
    const matching = () => {
      let list = (rows[table] ?? []).filter((row) =>
        filters.every(({ column, value }) =>
          Array.isArray(value) ? value.includes(row[column]) : row[column] === value,
        ),
      );
      if (order) {
        const { column, ascending } = order;
        list = [...list].sort((a, b) => {
          const av = String(a[column] ?? "");
          const bv = String(b[column] ?? "");
          return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }
      return list;
    };
    Object.assign(api, {
      select: () => api,
      eq: (column: string, value: unknown) => {
        filters.push({ column, value });
        return api;
      },
      in: (column: string, values: unknown[]) => {
        filters.push({ column, value: values });
        return api;
      },
      or: () => api,
      order: (column: string, opts?: { ascending?: boolean }) => {
        order = { column, ascending: opts?.ascending !== false };
        return api;
      },
      limit: () => api,
      insert: (payload: Record<string, unknown> | Record<string, unknown>[]) => {
        const list = Array.isArray(payload) ? payload : [payload];
        const withIds = list.map((row) => ({ id: `${table}-${(sequence += 1)}`, ...row }));
        inserted.push({ table, rows: withIds });
        rows[table] = [...(rows[table] ?? []), ...withIds];
        const result = { data: withIds[0] ?? null, error: null };
        return {
          select: () => ({ maybeSingle: async () => result }),
          then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
        };
      },
      update: (patch: Record<string, unknown>) => ({
        eq: async (_column: string, value: unknown) => {
          updates.push({ table, patch, id: value });
          for (const row of rows[table] ?? []) {
            if (row.id === value) Object.assign(row, patch);
          }
          return { data: null, error: null };
        },
      }),
      maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
      then: (resolve: (v: { data: Record<string, unknown>[]; error: null }) => unknown) =>
        Promise.resolve({ data: matching(), error: null }).then(resolve),
    });
    return api;
  }

  return {
    updates,
    inserted,
    rpcCalls,
    rows,
    admin: {
      from: (table: string) => builder(table),
      rpc: async (name: string, params: Record<string, unknown>) => {
        rpcCalls.push(name);
        if (name === "portal_slot_withdraw_arm" && options.armError) {
          return { data: null, error: { message: options.armError } };
        }
        if (name === "claim_portal_slot_withdraw_job") {
          const job = (rows.portal_slot_withdraw_jobs ?? []).find((row) => row.id === params._job_id);
          return { data: job ? [job] : [], error: null };
        }
        return { data: options.rpc?.[name] ?? null, error: null };
      },
    } as never,
  };
}

const listing = (id: string, agentId: string, publishedAt: string): SlotListing => ({
  propertyId: id,
  agentId,
  publishedAt,
  createdAt: publishedAt,
});

/* ---------------------------------- teste --------------------------------- */

describe("planSlotWithdrawals", () => {
  it("retrage cele mai recent publicate când alocarea unui agent scade", () => {
    const ids = planSlotWithdrawals({
      listings: [
        listing("old", "agent", "2026-01-01T00:00:00Z"),
        listing("mid", "agent", "2026-02-01T00:00:00Z"),
        listing("new", "agent", "2026-03-01T00:00:00Z"),
      ],
      agencyTotal: null,
      allocations: new Map([["agent", 1]]),
    });
    expect(ids).toEqual(["new", "mid"]);
  });

  it("nu retrage nimic când limitele sunt nelimitate", () => {
    expect(
      planSlotWithdrawals({
        listings: [listing("a", "agent", "2026-01-01T00:00:00Z")],
        agencyTotal: null,
        allocations: new Map([["agent", null]]),
      }),
    ).toEqual([]);
  });

  it("taie din totalul agenției, cel mai recent primul, peste limitele per agent", () => {
    const ids = planSlotWithdrawals({
      listings: [
        listing("a", "one", "2026-01-01T00:00:00Z"),
        listing("b", "two", "2026-02-01T00:00:00Z"),
        listing("c", "two", "2026-03-01T00:00:00Z"),
      ],
      agencyTotal: 1,
      allocations: new Map(),
    });
    expect(ids).toEqual(["c", "b"]);
  });
});

describe("planPortalSlotWithdrawals", () => {
  const baseRows = (): Rows => ({
    portal_slot_limits: [{ organization_id: "org", portal_key: "storia", total_slots: null }],
    portal_slot_allocations: [
      { organization_id: "org", portal_key: "storia", user_id: "agent", slots: 2 },
    ],
    portal_publications: [
      { organization_id: "org", portal_key: "storia", property_id: "p1", enabled: true },
      { organization_id: "org", portal_key: "storia", property_id: "p2", enabled: true },
    ],
    portal_listings: [
      { organization_id: "org", portal: "storia", property_id: "p1", published_at: "2026-01-01T00:00:00Z" },
      { organization_id: "org", portal: "storia", property_id: "p2", published_at: "2026-05-01T00:00:00Z" },
    ],
    properties: [
      { id: "p1", organization_id: "org", assigned_to: "agent", reference: "HB-1", title: "Unu" },
      { id: "p2", organization_id: "org", assigned_to: "agent", reference: "HB-2", title: "Doi" },
    ],
    profiles: [{ id: "agent", organization_id: "org", full_name: "Ana", email: "ana@x.ro" }],
  });

  it("previzualizarea nu scrie nimic și arată oferta cea mai recentă", async () => {
    const fake = fakeAdmin(baseRows());
    const plan = await planPortalSlotWithdrawals(fake.admin, {
      organizationId: "org",
      portalKey: "storia",
      allocation: { userId: "agent", slots: 1 },
    });
    expect(plan.map((item) => item.propertyId)).toEqual(["p2"]);
    expect(plan[0]?.reference).toBe("HB-2");
    expect(plan[0]?.agentName).toBe("Ana");
    // Anularea nu schimbă nimic: previzualizarea nu a scris în bază.
    expect(fake.inserted).toHaveLength(0);
    expect(fake.updates).toHaveLength(0);
  });

  it("citește doar ofertele selectate și neretrase", async () => {
    const rows = baseRows();
    rows.portal_publications = [
      { organization_id: "org", portal_key: "storia", property_id: "p1", enabled: true },
      { organization_id: "org", portal_key: "storia", property_id: "p2", enabled: false },
    ];
    const fake = fakeAdmin(rows);
    const listings = await loadPortalSlotListings(fake.admin, "org", "storia");
    expect(listings.map((row) => row.propertyId)).toEqual(["p1"]);
  });
});

describe("enqueuePortalSlotWithdrawals", () => {
  it("marchează jobul eșuat și raportează dacă programarea eșuează", async () => {
    const fake = fakeAdmin({ portal_slot_withdraw_jobs: [], portal_slot_withdraw_items: [] }, {
      armError: "arm boom",
    });
    const result = await enqueuePortalSlotWithdrawals(fake.admin, {
      organizationId: "org",
      portalKey: "storia",
      propertyIds: ["p2"],
      startedBy: "admin",
    });
    expect(result.error).toBe(SLOT_WITHDRAW_ARM_FAILED_MESSAGE);
    expect(fake.updates.some((u) => u.patch.status === "failed")).toBe(true);
  });
});

describe("processPortalSlotWithdrawJob", () => {
  const jobRows = (): Rows => ({
    portal_slot_withdraw_jobs: [
      {
        id: "job",
        organization_id: "org",
        portal_key: "storia",
        status: "queued",
        total: 2,
        done: 0,
        failed: 0,
        started_by: "admin",
        cancel_requested: false,
      },
    ],
    portal_slot_withdraw_items: [
      { id: "i1", job_id: "job", property_id: "p2", position: 0, status: "queued", attempts: 0 },
      { id: "i2", job_id: "job", property_id: "p1", position: 1, status: "queued", attempts: 0 },
    ],
  });

  it("retrage în ordinea cozii și raportează eșecul pe proprietate fără să blocheze restul", async () => {
    const fake = fakeAdmin(jobRows());
    const seen: string[] = [];
    const outcome = await processPortalSlotWithdrawJob(fake.admin, "job", {
      executeAction: async ({ propertyId }) => {
        seen.push(propertyId);
        return propertyId === "p2"
          ? { ok: false, code: "INVALID_REQUEST", message: "portalul a refuzat" }
          : { ok: true };
      },
    });
    expect(seen).toEqual(["p2", "p1"]);
    expect(outcome.status).toBe("done");
    expect(outcome.failed).toBe(1);
    expect(outcome.done).toBe(1);
    const failedItem = fake.rows.portal_slot_withdraw_items!.find((row) => row.id === "i1");
    expect(failedItem?.status).toBe("failed");
    expect(failedItem?.error).toBe("portalul a refuzat");
  });

  it("se oprește imediat dacă anularea a fost cerută", async () => {
    const rows = jobRows();
    rows.portal_slot_withdraw_jobs![0]!.cancel_requested = true;
    const fake = fakeAdmin(rows);
    let called = 0;
    const outcome = await processPortalSlotWithdrawJob(fake.admin, "job", {
      executeAction: async () => {
        called += 1;
        return { ok: true };
      },
    });
    expect(outcome.status).toBe("cancelled");
    expect(called).toBe(0);
  });

  it("amână jobul când portalul limitează ritmul", async () => {
    const fake = fakeAdmin(jobRows());
    const outcome = await processPortalSlotWithdrawJob(fake.admin, "job", {
      executeAction: async () => ({
        ok: false,
        code: "RATE_LIMIT",
        message: "prea multe cereri",
        retryAfterMs: 30_000,
      }),
    });
    expect(outcome.status).toBe("running");
    const job = fake.rows.portal_slot_withdraw_jobs![0]!;
    expect(job.next_attempt_at).toBeTruthy();
  });
});

describe("excluderea de la retrimiterea portofoliului La Cheie", () => {
  it("ofertele retrase din lipsă de locuri nu se retrimit", () => {
    expect(
      shouldResendLaCheiePublication({
        enabled: false,
        withdrawReason: LACHEIE_WITHDRAW_REASON.slotLimit,
      }),
    ).toBe(false);
    expect(LACHEIE_WITHDRAW_REASON.slotLimit).toBe(SLOT_LIMIT_WITHDRAW_REASON);
  });
});
