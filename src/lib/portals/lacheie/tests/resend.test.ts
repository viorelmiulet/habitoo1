/**
 * Retrimiterea portofoliului La Cheie după reactivare — teste comportamentale.
 *
 * Verifică ce se retrimite, motivul retragerii, un singur job activ pe agenție,
 * ritmul de scriere, așteptarea la 429, anularea și oprirea când agenția nu mai
 * este activă. Nicio cerere reală către portal.
 */
import { describe, expect, it } from "vitest";
import {
  LACHEIE_DEFAULT_WRITE_RATE,
  LACHEIE_RESEND_AGENCY_INACTIVE_MESSAGE,
  LACHEIE_RESEND_ALREADY_RUNNING_MESSAGE,
  LACHEIE_RESEND_NOTHING_TO_SEND_MESSAGE,
  LACHEIE_WITHDRAW_REASON,
  laCheieResendDelayMs,
  parseLaCheieAccountWriteRate,
  selectLaCheieResendTargets,
  shouldResendLaCheiePublication,
} from "@/lib/portals/lacheie/resend";
import { markLaCheieListingsWithdrawn } from "@/lib/portals/lacheie/withdraw.server";
import {
  collectLaCheieResendCandidates,
  processLaCheieResendJob,
  requestLaCheieResendCancel,
  startLaCheieResendJob,
} from "@/lib/portals/lacheie/resend.server";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/* ------------------------------ client fals ------------------------------- */

type Row = Record<string, unknown>;

/** Client admin în memorie: filtre eq/in, order/limit, insert/update. */
function fakeDb(tables: Record<string, Row[]>) {
  let sequence = 0;
  const db: Record<string, Row[]> = {};
  for (const [table, rows] of Object.entries(tables)) db[table] = rows.map((row) => ({ ...row }));

  const admin = {
    from(table: string) {
      db[table] ??= [];
      const eqs: [string, unknown][] = [];
      const ins: [string, unknown[]][] = [];
      const match = () =>
        db[table]!.filter(
          (row) =>
            eqs.every(([column, value]) => row[column] === value) &&
            ins.every(([column, values]) => values.includes(row[column])),
        );

      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          eqs.push([column, value]);
          return builder;
        },
        in: (column: string, values: unknown[]) => {
          ins.push([column, values]);
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({ data: match()[0] ?? null, error: null }),
        insert: (payload: Row | Row[]) => {
          const rows = (Array.isArray(payload) ? payload : [payload]).map((row) => ({
            id: `${table}-${++sequence}`,
            created_at: new Date(Date.now() + sequence).toISOString(),
            sent: 0,
            failed: 0,
            attempts: 0,
            cancel_requested: false,
            last_error: null,
            started_at: null,
            finished_at: null,
            error: null,
            ...row,
          }));
          db[table]!.push(...rows);
          const inserted = {
            select: () => inserted,
            maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
            then: (resolve: (value: { error: null }) => unknown) => resolve({ error: null }),
          };
          return inserted;
        },
        update: (patch: Row) => {
          const applied = {
            eq: (column: string, value: unknown) => {
              eqs.push([column, value]);
              return applied;
            },
            then: (resolve: (value: { error: null }) => unknown) => {
              for (const row of match()) Object.assign(row, patch);
              return resolve({ error: null });
            },
          };
          return applied;
        },
        then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
          resolve({ data: match(), error: null }),
      };
      return builder;
    },
  };
  return { admin: admin as never, db };
}

/* --------------------------- ce se retrimite ------------------------------ */

describe("La Cheie — selecția ofertelor de retrimis", () => {
  it("o retragere cerută de un om NU se retrimite", () => {
    expect(
      shouldResendLaCheiePublication({
        propertyId: "p1",
        enabled: false,
        withdrawReason: LACHEIE_WITHDRAW_REASON.user,
      }),
    ).toBe(false);
  });

  it("o retragere provocată de dezactivare SE retrimite", () => {
    expect(
      shouldResendLaCheiePublication({
        propertyId: "p2",
        enabled: false,
        withdrawReason: LACHEIE_WITHDRAW_REASON.agencyDeactivated,
      }),
    ).toBe(true);
  });

  it("ofertele bifate se retrimit, fără duplicate", () => {
    expect(
      selectLaCheieResendTargets([
        { propertyId: "p1", enabled: true, withdrawReason: null },
        { propertyId: "p1", enabled: true, withdrawReason: null },
        { propertyId: "p2", enabled: false, withdrawReason: LACHEIE_WITHDRAW_REASON.user },
      ]),
    ).toEqual(["p1"]);
  });

  it("include ofertele retrase de dezactivare care nu mai au rând de selecție", async () => {
    const { admin } = fakeDb({
      portal_publications: [
        { organization_id: ORG, portal_key: "lacheie", property_id: "p1", enabled: true },
      ],
      portal_listings: [
        {
          organization_id: ORG,
          portal: "lacheie",
          property_id: "p9",
          withdraw_reason: LACHEIE_WITHDRAW_REASON.agencyDeactivated,
        },
        { organization_id: ORG, portal: "lacheie", property_id: "p8", withdraw_reason: "user" },
      ],
    });
    const candidates = await collectLaCheieResendCandidates(admin, ORG);
    expect(selectLaCheieResendTargets(candidates)).toEqual(["p1", "p9"]);
  });
});

describe("La Cheie — motivul retragerii la dezactivare", () => {
  it("se scrie „agency_deactivated” în ambele tabele", async () => {
    const { admin, db } = fakeDb({
      portal_listings: [{ organization_id: ORG, portal: "lacheie", property_id: "p1" }],
      portal_publications: [{ organization_id: ORG, portal_key: "lacheie", property_id: "p1" }],
    });
    const result = await markLaCheieListingsWithdrawn(admin as never, ORG, "actor");
    expect(result.ok).toBe(true);
    expect(db["portal_listings"]![0]!["withdraw_reason"]).toBe(
      LACHEIE_WITHDRAW_REASON.agencyDeactivated,
    );
    expect(db["portal_publications"]![0]!["withdraw_reason"]).toBe(
      LACHEIE_WITHDRAW_REASON.agencyDeactivated,
    );
    expect(db["portal_listings"]![0]!["status"]).toBe("withdrawn");
  });
});

/* --------------------------------- jobul ---------------------------------- */

function jobDb(properties: string[]) {
  return fakeDb({
    portal_publications: properties.map((property_id) => ({
      organization_id: ORG,
      portal_key: "lacheie",
      property_id,
      enabled: true,
    })),
    portal_listings: [],
    lacheie_resend_jobs: [],
    lacheie_resend_items: [],
  });
}

describe("La Cheie — jobul de retrimitere", () => {
  it("un singur job activ pe agenție", async () => {
    const { admin } = jobDb(["p1", "p2"]);
    const first = await startLaCheieResendJob(admin, { organizationId: ORG, startedBy: "u" });
    expect(first.total).toBe(2);
    await expect(
      startLaCheieResendJob(admin, { organizationId: ORG, startedBy: "u" }),
    ).rejects.toThrow(LACHEIE_RESEND_ALREADY_RUNNING_MESSAGE);
  });

  it("fără oferte de retrimis, jobul nu se creează", async () => {
    const { admin } = fakeDb({
      portal_publications: [],
      portal_listings: [],
      lacheie_resend_jobs: [],
      lacheie_resend_items: [],
    });
    await expect(
      startLaCheieResendJob(admin, { organizationId: ORG, startedBy: "u" }),
    ).rejects.toThrow(LACHEIE_RESEND_NOTHING_TO_SEND_MESSAGE);
  });

  it("trimite ofertele la ritmul raportat de /account și repune publicarea", async () => {
    const { admin, db } = jobDb(["p1", "p2"]);
    const job = await startLaCheieResendJob(admin, {
      organizationId: ORG,
      startedBy: "u",
      writeRate: 30,
    });
    const waits: number[] = [];
    const outcome = await processLaCheieResendJob(admin, job.jobId, {
      executeAction: async () => ({ ok: true as const }),
      agencyStatus: async () => "active",
      sleep: async (ms) => void waits.push(ms),
    });
    expect(outcome.status).toBe("done");
    expect(outcome.sent).toBe(2);
    expect(waits.every((ms) => ms >= laCheieResendDelayMs(30))).toBe(true);
    expect(db["portal_publications"]!.every((row) => row["enabled"] === true)).toBe(true);
    expect(db["portal_publications"]!.every((row) => row["withdraw_reason"] === null)).toBe(true);
  });

  it("la 429 așteaptă Retry-After și păstrează oferta în coadă", async () => {
    const { admin } = jobDb(["p1"]);
    const job = await startLaCheieResendJob(admin, { organizationId: ORG, startedBy: "u" });
    const waits: number[] = [];
    let attempt = 0;
    const outcome = await processLaCheieResendJob(admin, job.jobId, {
      executeAction: async () => {
        attempt += 1;
        return attempt === 1
          ? {
              ok: false as const,
              code: "RATE_LIMIT",
              message: "prea multe cereri",
              retryAfterMs: 12_000,
            }
          : { ok: true as const };
      },
      agencyStatus: async () => "active",
      sleep: async (ms) => void waits.push(ms),
    });
    expect(waits).toContain(12_000);
    expect(outcome.sent).toBe(1);
    expect(outcome.status).toBe("done");
  });

  it("o ofertă respinsă nu oprește restul, iar jobul se încheie „done”", async () => {
    const { admin } = jobDb(["p1", "p2"]);
    const job = await startLaCheieResendJob(admin, { organizationId: ORG, startedBy: "u" });
    let call = 0;
    const outcome = await processLaCheieResendJob(admin, job.jobId, {
      executeAction: async () => {
        call += 1;
        return call === 1
          ? { ok: false as const, code: "VALIDATION_ERROR", message: "câmp lipsă" }
          : { ok: true as const };
      },
      agencyStatus: async () => "active",
      sleep: async () => {},
    });
    expect(outcome.status).toBe("done");
    expect(outcome.failed).toBe(1);
    expect(outcome.sent).toBe(1);
  });

  it("anularea oprește retrimiterea", async () => {
    const { admin } = jobDb(["p1", "p2", "p3"]);
    const job = await startLaCheieResendJob(admin, { organizationId: ORG, startedBy: "u" });
    await requestLaCheieResendCancel(admin, ORG);
    const outcome = await processLaCheieResendJob(admin, job.jobId, {
      executeAction: async () => ({ ok: true as const }),
      agencyStatus: async () => "active",
      sleep: async () => {},
    });
    expect(outcome.status).toBe("cancelled");
    expect(outcome.sent).toBe(0);
  });

  it("dacă agenția nu mai este activă, jobul se oprește și raportează", async () => {
    const { admin } = jobDb(["p1"]);
    const job = await startLaCheieResendJob(admin, { organizationId: ORG, startedBy: "u" });
    const outcome = await processLaCheieResendJob(admin, job.jobId, {
      executeAction: async () => ({ ok: true as const }),
      agencyStatus: async () => "inactive",
      sleep: async () => {},
    });
    expect(outcome.status).toBe("failed");
    expect(outcome.stopped).toBe(LACHEIE_RESEND_AGENCY_INACTIVE_MESSAGE);
  });
});

/* ------------------------------- throttling ------------------------------- */

describe("La Cheie — ritmul de scriere", () => {
  it("citește write_rate din /account, oriunde îl pune portalul", () => {
    expect(parseLaCheieAccountWriteRate({ limits: { write_rate: 20 } })).toBe(20);
    expect(parseLaCheieAccountWriteRate({ account: { limits: { writes_per_minute: "30" } } })).toBe(
      30,
    );
    expect(parseLaCheieAccountWriteRate({})).toBe(LACHEIE_DEFAULT_WRITE_RATE);
    // Nu depășim niciodată limita din documentație.
    expect(parseLaCheieAccountWriteRate({ write_rate: 5_000 })).toBe(LACHEIE_DEFAULT_WRITE_RATE);
  });

  it("o ofertă pe cerere, la ritmul limitei", () => {
    expect(laCheieResendDelayMs(60)).toBe(1_000);
    expect(laCheieResendDelayMs(30)).toBe(2_000);
    expect(laCheieResendDelayMs(0)).toBe(1_000);
  });
});
