/** Reîncercarea automată a erorilor temporare de publicare — simulare, fără portaluri reale. */
import { describe, expect, it } from "vitest";
import { decideJobResult, runPortalPublishWorker, type PublishJobRow } from "../publish-jobs.server";
import { retryStatusLabel } from "../transient-failure";
import { selectTransientRecovery, type RecoveryPublication } from "../transient-recovery.server";

const MIN = 60_000;

describe("decideJobResult — erori temporare", () => {
  it("un 521 de la La Cheie creează reîncercarea cu backoff 2 min, apoi 10 min", () => {
    const fail = { portalId: "lacheie", ok: false, message: "La Cheie a returnat o eroare temporară.", httpStatus: 521 };
    expect(decideJobResult({ attempts: 1, portal_key: "lacheie" }, fail, undefined)).toMatchObject({ status: "queued", retryInMs: 2 * MIN });
    expect(decideJobResult({ attempts: 2, portal_key: "lacheie" }, fail, undefined)).toMatchObject({ status: "queued", retryInMs: 10 * MIN });
    expect(decideJobResult({ attempts: 5, portal_key: "lacheie" }, fail, undefined)).toMatchObject({ status: "queued", retryInMs: 360 * MIN });
  });

  it("un 429 respectă Retry-After când e mai lung decât pauza", () => {
    const fail = { portalId: "vdi", ok: false, message: "Limita VDI.ro de cereri pe minut a fost atinsă.", httpStatus: 429, code: "RATE_LIMIT", retryAfterMs: 15 * MIN };
    expect(decideJobResult({ attempts: 1, portal_key: "vdi" }, fail, undefined)).toMatchObject({ status: "queued", retryInMs: 15 * MIN });
  });

  it("IMAGE_REHOST_FAILED de la HomeDirect se reîncearcă", () => {
    const fail = { portalId: "homedirect", ok: false, code: "VALIDATION_ERROR", httpStatus: 422, message: "HomeDirect a respins datele trimise. Câmp: images. IMAGE_REHOST_FAILED." };
    expect(decideJobResult({ attempts: 1, portal_key: "homedirect" }, fail, undefined).status).toBe("queued");
  });

  it("o eroare de validare nu se reîncearcă", () => {
    const fail = { portalId: "lacheie", ok: false, code: "VALIDATION_ERROR", message: "Oferta nu este publicabilă: lipsește prețul." };
    expect(decideJobResult({ attempts: 1, portal_key: "lacheie" }, fail, undefined).status).toBe("error");
    const auth = { portalId: "vdi", ok: false, httpStatus: 401, message: "Token invalid." };
    expect(decideJobResult({ attempts: 1, portal_key: "vdi" }, auth, undefined).status).toBe("error");
  });

  it("eticheta arată încercarea și ora României", () => {
    expect(retryStatusLabel(2, new Date("2026-11-23T17:02:00Z"))).toBe("Se reîncearcă (încercarea 2, următoarea la 19:02)");
  });
});

function worker(job: Partial<PublishJobRow>) {
  const row: PublishJobRow & { status: string } = {
    id: "j1", organization_id: "org", property_id: "prop", portal_key: "lacheie", enabled: true, promoted: null,
    sync_existing: true, requested_by: "agent", superadmin: false, attempts: 0, status: "queued", ...job,
  };
  const notifications: Record<string, unknown>[] = [];
  let claimed = false;
  const updates: { table: string; patch: Record<string, unknown> }[] = [];
  const chain = (table: string, patch?: Record<string, unknown>) => {
    const q: any = { eq: () => q, then: (r: (v: unknown) => void) => r({ data: null, error: null }) };
    if (patch) updates.push({ table, patch });
    return q;
  };
  const admin = {
    rpc: async (name: string) => {
      if (name === "claim_portal_publish_jobs") {
        if (row.status !== "queued" || claimed) return { data: [], error: null };
        claimed = true;
        row.status = "running"; row.attempts += 1;
        return { data: [{ ...row }], error: null };
      }
      return { data: null, error: null };
    },
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => { if (table === "portal_publish_jobs") row.status = String(patch["status"]); return chain(table, patch); },
      insert: async (r: Record<string, unknown>) => { if (table === "notifications") notifications.push(r); return { error: null }; },
    }),
  };
  return { admin, row, notifications, updates };
}

describe("workerul — reîncercare și eroare finală", () => {
  const fail = async () => ({ portalId: "lacheie", ok: false, message: "La Cheie a returnat o eroare temporară.", httpStatus: 521 });

  it("după 521 jobul revine în coadă, iar publicarea arată „Se reîncearcă”", async () => {
    const w = worker({});
    const stats = await runPortalPublishWorker(w.admin, fail, { concurrency: 1, budgetMs: 1000 });
    expect(stats.retried).toBe(1);
    expect(w.row.status).toBe("queued");
    const pub = w.updates.find((u) => u.table === "portal_publications");
    expect(pub?.patch["status"]).toBe("pending");
    expect(String(pub?.patch["last_error"])).toMatch(/^Se reîncearcă \(încercarea 2, următoarea la \d\d:\d\d\)$/);
    expect(w.notifications).toHaveLength(0);
  });

  it("după ultima încercare statusul devine error final, cu notificare", async () => {
    const w = worker({ attempts: 5 }); // a 6-a trimitere = după 5 reîncercări
    const stats = await runPortalPublishWorker(w.admin, fail, { concurrency: 1, budgetMs: 1000 });
    expect(stats.failed).toBe(1);
    expect(w.row.status).toBe("error");
    expect(w.updates.some((u) => u.table === "portal_publications")).toBe(false);
    expect(w.notifications).toHaveLength(1);
  });
});

describe("recuperarea erorilor temporare", () => {
  const base: RecoveryPublication = { organization_id: "org", property_id: "p1", portal_key: "lacheie", enabled: true, status: "error",
    last_error: "La Cheie a returnat o eroare temporară. Se reia aceeași operație, fără versiune nouă.", withdrawn_at: null, updated_by: "agent", created_by: "agent" };
  const prop = (id: string, status = "active") => [id, { id, status, deleted_at: null, assigned_to: "agent" }] as const;

  it("pune în coadă doar erorile temporare ale anunțurilor publicate și bifate, eșalonat", () => {
    const out = selectTransientRecovery({
      publications: [
        base,
        { ...base, property_id: "p2", portal_key: "vdi", last_error: "Limita VDI.ro de cereri pe minut a fost atinsă. Reîncercăm automat." },
        { ...base, property_id: "p3", portal_key: "homedirect", last_error: "HomeDirect.ro: Portalul a returnat o eroare. Reîncearcă mai târziu." },
        { ...base, property_id: "p4", last_error: "La Cheie a returnat o eroare temporară." },
        { ...base, property_id: "p5", last_error: "Oferta nu este publicabilă: lipsește prețul." },
        { ...base, property_id: "p6", enabled: false },
        { ...base, property_id: "p7" },
        { ...base, property_id: "p8" },
      ],
      properties: new Map([prop("p1"), prop("p2"), prop("p3"), prop("p4"), prop("p5"), prop("p6"), prop("p7", "sold"), prop("p8")]),
      activatedPortals: new Set(["org|lacheie", "org|vdi", "org|homedirect"]),
      activeJobs: new Set(["p8|lacheie"]),
      nowMs: 0,
    });
    expect(out.perPortal).toEqual({ lacheie: 2, vdi: 1, homedirect: 1 });
    expect(out.jobs.map((j) => j["property_id"])).toEqual(["p1", "p2", "p3", "p4"]);
    expect(out.jobs[3]).toMatchObject({ operation: "republish", attempts: 1, next_attempt_at: new Date(30_000).toISOString() });
  });
});
