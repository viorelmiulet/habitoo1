/**
 * Timeout / eroare de rețea la portaluri: reîncercare doar la portalurile
 * idempotente (30 s, 2 min), anunțul publicat rămâne publicat cu nota, iar
 * durata operației se salvează în jurnal. Fără apeluri reale la portaluri.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decideJobResult } from "@/lib/portals/publish-jobs.server";
import { isRetryablePortalBulkError } from "@/lib/portals/bulk";
import { processPortalBulkProperty } from "@/lib/portals/bulk.server";
import { imospotTimeoutMs } from "@/lib/portals/adapters/imospot.server";
import { deriveState } from "@/lib/portals/portal-state";
import {
  TIMEOUT_RETRY_PORTALS,
  UNCONFIRMED_UPDATE_NOTE,
  unconfirmedUpdateState,
} from "@/lib/portals/transient-failure";

vi.mock("@tanstack/react-start", () => {
  const build = () => {
    const self: Record<string, unknown> = {};
    self["middleware"] = () => self;
    self["inputValidator"] = (fn: (i: unknown) => unknown) => {
      self["_validator"] = fn;
      return self;
    };
    self["handler"] = (fn: (a: unknown) => unknown) => (args: unknown) => fn(args);
    return self;
  };
  return {
    createServerFn: () => build(),
    createMiddleware: () => ({ middleware: () => ({ server: () => ({}) }), server: () => ({}) }),
  };
});
vi.mock("@/lib/org-access", () => ({ requireActiveOrgAuth: {} }));

const TIMEOUT_MESSAGE = "Imospot: Portalul nu a răspuns în timp util.";

describe("timeout Imospot", () => {
  it("45 s pentru POST/PUT, 15 s pentru GET și DELETE", () => {
    expect(imospotTimeoutMs("POST")).toBe(45_000);
    expect(imospotTimeoutMs("PUT")).toBe(45_000);
    expect(imospotTimeoutMs("GET")).toBe(15_000);
    expect(imospotTimeoutMs("DELETE")).toBe(15_000);
  });
});

describe("reîncercarea automată la timeout", () => {
  it("lista portalurilor idempotente este exact cea cerută", () => {
    expect([...TIMEOUT_RETRY_PORTALS].sort()).toEqual(
      ["imobiliare_ro", "imospot", "lacheie", "oferteimobiliare", "primulanunt", "romimo", "vdi"].sort(),
    );
  });

  it("TIMEOUT la Imospot → 2 reîncercări, după 30 s și 2 min, apoi eroare", () => {
    const outcome = { portalId: "imospot", ok: false, code: "TIMEOUT", message: TIMEOUT_MESSAGE };
    const first = decideJobResult({ attempts: 1, portal_key: "imospot" }, outcome, undefined);
    const second = decideJobResult({ attempts: 2, portal_key: "imospot" }, outcome, undefined);
    const third = decideJobResult({ attempts: 3, portal_key: "imospot" }, outcome, undefined);
    expect(first).toMatchObject({ status: "queued", retryInMs: 30_000 });
    expect(second).toMatchObject({ status: "queued", retryInMs: 120_000 });
    expect(third.status).toBe("error");
  });

  it("recunoaște și mesajul românesc „în timp util” fără cod", () => {
    const outcome = { portalId: "imospot", ok: false, message: TIMEOUT_MESSAGE };
    expect(decideJobResult({ attempts: 1, portal_key: "imospot" }, outcome, undefined).status).toBe("queued");
    expect(isRetryablePortalBulkError({ message: TIMEOUT_MESSAGE, portalId: "imospot" })).toBe(true);
  });

  it("NETWORK_ERROR la VDI se reîncearcă", () => {
    const outcome = { portalId: "vdi", ok: false, code: "NETWORK_ERROR", message: "VDI: Portalul nu a putut fi contactat." };
    expect(decideJobResult({ attempts: 1, portal_key: "vdi" }, outcome, undefined)).toMatchObject({ status: "queued", retryInMs: 30_000 });
  });

  it("TIMEOUT la un portal neidempotent (Storia) → fără reîncercare", () => {
    const outcome = { portalId: "storia", ok: false, code: "TIMEOUT", message: "Storia: Portalul nu a răspuns în timp util." };
    expect(decideJobResult({ attempts: 1, portal_key: "storia" }, outcome, undefined).status).toBe("error");
    expect(isRetryablePortalBulkError({ code: "TIMEOUT", portalId: "storia" })).toBe(false);
    expect(isRetryablePortalBulkError({ code: "TIMEOUT" })).toBe(false);
  });

  it("publicarea în masă programează la fel reîncercările de timeout", async () => {
    const updates: Record<string, unknown>[] = [];
    const now = 1_000_000;
    const admin = {
      rpc: async () => ({
        data: [
          { id: "i1", job_id: "j", property_id: "p", portal_key: "imospot", enabled: true, promoted: null, attempts: 0, max_attempts: 4 },
          { id: "i2", job_id: "j", property_id: "p", portal_key: "storia", enabled: true, promoted: null, attempts: 0, max_attempts: 4 },
        ],
      }),
      from: (table: string) => {
        const q: Record<string, unknown> = {};
        q["update"] = (row: Record<string, unknown>) => {
          if (table === "portal_bulk_items") updates.push(row);
          return q;
        };
        q["select"] = () => q;
        q["eq"] = () => q;
        q["then"] = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
        return q;
      },
    };
    await processPortalBulkProperty(
      admin,
      { jobId: "j", propertyId: "p", organizationId: "o", actorId: "u" },
      {
        apply: async () => [
          { portalId: "imospot", ok: false, code: "TIMEOUT", message: TIMEOUT_MESSAGE },
          { portalId: "storia", ok: false, code: "TIMEOUT", message: "Storia: Portalul nu a răspuns în timp util." },
        ],
        now: () => now,
        pause: async () => undefined,
      },
    );
    expect(updates[0]).toMatchObject({ status: "queued", next_attempt_at: new Date(now + 30_000).toISOString() });
    expect(updates[1]).toMatchObject({ status: "failed" });
  });
});

describe("starea după o actualizare neconfirmată", () => {
  it("anunțul publicat rămâne publicat, cu nota", () => {
    const state = unconfirmedUpdateState({
      ok: false, action: "update", code: "TIMEOUT", message: TIMEOUT_MESSAGE,
      previousStatus: "published", externalId: "HB-1128",
    });
    expect(state).toEqual({ keepStatus: "published", note: `${UNCONFIRMED_UPDATE_NOTE}.` });
    expect(
      deriveState({
        availability: "available", configured: true, selected: true,
        listingStatus: state!.keepStatus, publicationStatus: "synced", pushSupported: true, feedEligible: true,
      }),
    ).toBe("published");
  });

  it("un anunț nepublicat sau o eroare de validare trec pe eroare", () => {
    expect(unconfirmedUpdateState({ ok: false, action: "publish", code: "TIMEOUT", previousStatus: "pending", externalId: null })).toBeNull();
    expect(unconfirmedUpdateState({ ok: false, action: "update", code: "VALIDATION_ERROR", message: "Imospot a respins datele", previousStatus: "published", externalId: "HB-1" })).toBeNull();
  });
});

/* ---------------- executeListingAction, cu adaptor simulat ---------------- */

const writes: { table: string; op: string; row: Record<string, unknown> }[] = [];
const notify = vi.fn(async () => undefined);
let adapterResult: Record<string, unknown> = {};

function chain(table: string) {
  const q: Record<string, unknown> = {};
  const single = (): unknown => {
    if (table === "properties") return { id: "prop-1", publish_status: "published", status: "active", deleted_at: null };
    if (table === "portal_listings") return { id: "l-1", status: "published", external_id: "HB-1128", portal_offers: [] };
    return null;
  };
  for (const k of ["select", "eq", "order", "limit", "in", "is"]) q[k] = () => q;
  q["maybeSingle"] = async () => ({ data: single(), error: null });
  q["insert"] = async (row: Record<string, unknown>) => {
    writes.push({ table, op: "insert", row });
    return { data: null, error: null };
  };
  q["update"] = (row: Record<string, unknown>) => {
    writes.push({ table, op: "update", row });
    return q;
  };
  q["then"] = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
  return q;
}

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (t: string) => chain(t) } }));
vi.mock("@/lib/portals/rate-limit.server", () => ({ portalRateLimited: () => false }));
vi.mock("@/lib/site-feed/mapper", () => ({ isPropertyFeedEligible: () => true }));
vi.mock("@/lib/portals/requirements.server", () => ({ portalRequirementReport: async () => ({ ok: true }) }));
vi.mock("@/lib/portals/crypto.server", () => ({ decryptPortalCredential: () => null }));
vi.mock("@/lib/portals/failure-notification.server", () => ({ notifyPortalFailure: notify }));
vi.mock("@/lib/portals/adapters/index.server", () => ({
  getPortalAdapter: () => ({
    publishListing: async () => adapterResult,
    updateListing: async () => {
      await new Promise((r) => setTimeout(r, 5));
      return adapterResult;
    },
    withdrawListing: async () => adapterResult,
  }),
}));

describe("executeListingAction la timeout pe un anunț publicat", () => {
  beforeEach(() => {
    writes.length = 0;
    notify.mockClear();
  });

  it("statusul rămâne publicat, cu nota, fără notificare de eroare; durata e salvată", async () => {
    adapterResult = { ok: false, code: "TIMEOUT", message: "Portalul nu a răspuns în timp util." };
    const { executeListingAction } = await import("@/lib/portals.functions");
    const result = await executeListingAction({
      organizationId: "org-1", actorId: "user-1", portalId: "imospot", propertyId: "prop-1", action: "update",
    });
    // Rezultatul rămâne un eșec TIMEOUT, ca workerul să programeze reîncercarea.
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("TIMEOUT");

    const listing = writes.find((w) => w.table === "portal_listings" && w.op === "update");
    expect(listing?.row["status"]).toBe("published");
    expect(listing?.row["last_error"]).toBe(`${UNCONFIRMED_UPDATE_NOTE}.`);
    const pub = writes.find((w) => w.table === "portal_publications" && w.op === "update");
    expect(pub?.row["status"]).toBe("synced");
    expect(pub?.row["external_ref"]).toBe("HB-1128");
    expect(notify).not.toHaveBeenCalled();

    const log = writes.find((w) => w.table === "portal_operation_logs");
    expect(log?.row["error_code"]).toBe("TIMEOUT");
    expect(typeof log?.row["duration_ms"]).toBe("number");
    expect(log!.row["duration_ms"] as number).toBeGreaterThanOrEqual(0);
  });

  it("duration_ms este completat și la succes", async () => {
    adapterResult = { ok: true, data: { externalId: "HB-1128", live: true, detail: "ok" } };
    const { executeListingAction } = await import("@/lib/portals.functions");
    await executeListingAction({
      organizationId: "org-1", actorId: "user-1", portalId: "imospot", propertyId: "prop-1", action: "update",
    });
    const log = writes.find((w) => w.table === "portal_operation_logs");
    expect(log?.row["success"]).toBe(true);
    expect(typeof log?.row["duration_ms"]).toBe("number");
  });
});
