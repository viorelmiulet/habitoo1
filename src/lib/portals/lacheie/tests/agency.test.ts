/**
 * Teste pentru modelul de furnizor CRM La Cheie:
 * activare/reactivare agenție, statusuri, versiuni separate, headerul
 * `X-Agency-External-ID`, izolarea între agenții, protecția cheii de furnizor
 * și regresia „fără mediu de test”.
 */
import { readFileSync } from "node:fs";
import { markLaCheieListingsWithdrawn } from "@/lib/portals/lacheie/withdraw.server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortalError } from "../../errors";
import {
  LACHEIE_AGENCY_ASSOCIATION_CONFLICT_MESSAGE,
  LACHEIE_AGENCY_FIELD_LABEL,
  LACHEIE_AGENCY_SUSPENDED_MESSAGE,
  buildLaCheieAgencyPayload,
  canActivateLaCheieAgency,
  classifyLaCheieAgencyPut,
  isLaCheieAgencyReactivation,
  isValidLaCheieAgencyPhone,
  laCheieAgencyBodyHash,
  laCheieAgencyPendingPatch,
  laCheieAgencyStatusAfterDelete,
  planLaCheieAgencyOperation,
  readLaCheieAgencyPending,
  selectLaCheieAdminEmail,
  isValidLaCheieAgencyExternalId,
  laCheieAgencyBlockReason,
  laCheieAgencyExternalId,
  nextLaCheieAgencyVersion,
  parseLaCheieAgencyBody,
  readLaCheieAgencyState,
} from "../agency";
import { deleteLaCheieAgency, getLaCheieAgency, putLaCheieAgency } from "../agency.server";
import { laCheieRequest } from "../client.server";
import {
  LACHEIE_AGENCY_HEADER,
  laCheieAgenciesPath,
  normalizeLaCheiePortalSettings,
} from "../config";

const ORG = "04041622-b3d2-4cbe-a214-2ae9bfa34492";
const PROFILE = {
  name: "Agenția Exemplu",
  email: "contact@exemplu.ro",
  phone: "0722000111",
  address: "Str. Exemplu 1, București",
};

function config(overrides: Record<string, unknown> = {}) {
  return {
    baseUrl: "https://api.lacheie.ro/api/partners/v1",
    apiKey: "lc_crm_super-secret",
    environment: "production" as const,
    agencyExternalId: laCheieAgencyExternalId(ORG),
    connectionKey: `${Math.random()}`,
    ...overrides,
  };
}

type Call = { url: string; init: RequestInit };
const calls: Call[] = [];

function respond(entries: { status: number; body?: unknown; headers?: Record<string, string> }[]) {
  let index = 0;
  return vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    const entry = entries[Math.min(index, entries.length - 1)]!;
    index += 1;
    return new Response(JSON.stringify(entry.body ?? {}), {
      status: entry.status,
      headers: { "content-type": "application/json", ...(entry.headers ?? {}) },
    });
  });
}

function headersOf(index: number): Headers {
  return new Headers(calls[index]!.init.headers as HeadersInit);
}

beforeEach(() => {
  calls.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function run<T>(promise: Promise<T>): Promise<T> {
  const settled = promise;
  await vi.runAllTimersAsync();
  return settled;
}

describe("La Cheie — identificatorul și datele agenției", () => {
  it("external_id este stabil, ASCII, maximum 64 de caractere", () => {
    const first = laCheieAgencyExternalId(ORG);
    expect(first).toBe(laCheieAgencyExternalId(ORG));
    expect(first.length).toBeLessThanOrEqual(64);
    expect(isValidLaCheieAgencyExternalId(first)).toBe(true);
    expect(isValidLaCheieAgencyExternalId("")).toBe(false);
    expect(isValidLaCheieAgencyExternalId("cu spațiu")).toBe(false);
    expect(isValidLaCheieAgencyExternalId("x".repeat(65))).toBe(false);
  });

  it("payload-ul cere date reale: nimic nu este inventat", () => {
    const missing = buildLaCheieAgencyPayload({
      name: "Agenția Exemplu",
      adminEmail: null,
      phone: null,
      address: null,
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.missing).toEqual(["email", "phone", "address"]);

    const built = buildLaCheieAgencyPayload({
      name: PROFILE.name,
      adminEmail: PROFILE.email,
      phone: PROFILE.phone,
      address: PROFILE.address,
    });
    expect(built.ok).toBe(true);
    if (built.ok) expect(built.payload).toEqual(PROFILE);
  });

  it("emailul invalid este raportat, nu corectat", () => {
    const result = buildLaCheieAgencyPayload({
      name: "A",
      adminEmail: "fara-arond",
      phone: "0722000111",
      address: "Str. 1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toEqual(["email"]);
  });

  it("respectă limitele de lungime și regulile de telefon ale portalului", () => {
    const tooLong = buildLaCheieAgencyPayload({
      name: "x".repeat(256),
      adminEmail: `${"a".repeat(250)}@exemplu.ro`,
      phone: "0722",
      address: "y".repeat(256),
    });
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) {
      expect(tooLong.missing).toEqual(["name", "email", "phone", "address"]);
      expect(tooLong.issues.join(" ")).toMatch(/255|254|7–15/);
    }
    expect(isValidLaCheieAgencyPhone("+40 722 000 111")).toBe(true);
    expect(isValidLaCheieAgencyPhone("0722")).toBe(false);
    expect(isValidLaCheieAgencyPhone("0".repeat(31))).toBe(false);
    expect(isValidLaCheieAgencyPhone("0722 abc 111")).toBe(false);
  });

  it("adresa lipsă NU mai este înlocuită cu orașul", () => {
    const result = buildLaCheieAgencyPayload({
      name: PROFILE.name,
      adminEmail: PROFILE.email,
      phone: PROFILE.phone,
      address: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toEqual(["address"]);
    expect(LACHEIE_AGENCY_FIELD_LABEL["address"]).toBe("Adresa agenției");
  });


  it("setările de agenție supraviețuiesc normalizării, cele de TEST nu", () => {
    const normalized = normalizeLaCheiePortalSettings({
      allow_live: true,
      lacheie_agency_external_id: "hbt-1",
      lacheie_agency_status: "active",
      lacheie_agency_version: "4",
      lacheie_environment: "test",
      lacheie_test_base_url: "https://test.invalid/v1",
    });
    expect(normalized["lacheie_agency_status"]).toBe("active");
    expect(normalized).not.toHaveProperty("lacheie_environment");
    expect(normalized).not.toHaveProperty("lacheie_test_base_url");
  });
});

describe("La Cheie — versiunea agenției", () => {
  it("prima înregistrare folosește versiunea 1", () => {
    const state = readLaCheieAgencyState({});
    expect(state.status).toBe("not_registered");
    expect(nextLaCheieAgencyVersion(state)).toBe("1");
  });

  it("reactivarea cere o versiune mai mare, independentă de ofertele publicate", () => {
    const state = readLaCheieAgencyState({
      lacheie_agency_external_id: "hbt-1",
      lacheie_agency_status: "inactive",
      lacheie_agency_version: "7",
      // Versiunile ofertelor nu influențează versiunea agenției.
      lacheie_catalog_fetched_at: "2026-01-01T00:00:00.000Z",
    });
    expect(nextLaCheieAgencyVersion(state)).toBe("8");
  });

  it("versiunea acceptată de portal are prioritate după conflict", () => {
    const state = readLaCheieAgencyState({
      lacheie_agency_external_id: "hbt-1",
      lacheie_agency_status: "active",
      lacheie_agency_version: "3",
      lacheie_agency_accepted_version: "11",
    });
    expect(nextLaCheieAgencyVersion(state)).toBe("12");
  });

  it("suspendarea administrativă nu poate fi ocolită", () => {
    expect(canActivateLaCheieAgency("suspended")).toBe(false);
    expect(canActivateLaCheieAgency("inactive")).toBe(true);
    const blocked = laCheieAgencyBlockReason(
      readLaCheieAgencyState({
        lacheie_agency_external_id: "hbt-1",
        lacheie_agency_status: "suspended",
      }),
    );
    expect(blocked).toMatch(/suspendat/i);
  });
});

describe("La Cheie — PUT/GET/DELETE /agencies", () => {
  it("activarea inițială trimite 1 în X-Source-Version și body-ul complet", async () => {
    vi.stubGlobal("fetch", respond([{ status: 201, body: { agency: { status: "active" } } }]));
    const call = await run(
      putLaCheieAgency(config(), {
        externalId: laCheieAgencyExternalId(ORG),
        payload: PROFILE,
        version: "1",
      }),
    );
    expect(call.response.ok).toBe(true);
    expect(call.agency.status).toBe("active");
    expect(calls[0]!.url).toContain(laCheieAgenciesPath(laCheieAgencyExternalId(ORG)));
    expect(calls[0]!.init.method).toBe("PUT");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual(PROFILE);
    const headers = headersOf(0);
    expect(headers.get("authorization")).toBe("Bearer lc_crm_super-secret");
    expect(headers.get("x-source-version")).toBe("1");
    // Administrarea agenției NU trimite X-Agency-External-ID.
    expect(headers.get(LACHEIE_AGENCY_HEADER.toLowerCase())).toBeNull();
  });

  it("reactivarea repetă PUT cu o versiune mai mare și primește 200", async () => {
    vi.stubGlobal(
      "fetch",
      respond([{ status: 200, body: { agency: { status: "active", accepted_version: "8" } } }]),
    );
    const call = await run(
      putLaCheieAgency(config(), { externalId: "hbt-1", payload: PROFILE, version: "8" }),
    );
    expect(call.response.status).toBe(200);
    expect(call.agency.acceptedVersion).toBe("8");
    expect(headersOf(0).get("x-source-version")).toBe("8");
  });

  it("409 raportează versiunea acceptată, fără reluare automată", async () => {
    vi.stubGlobal("fetch", respond([{ status: 409, body: { accepted_version: "15" } }]));
    const call = await run(
      putLaCheieAgency(config(), { externalId: "hbt-1", payload: PROFILE, version: "2" }),
    );
    expect(call.response.ok).toBe(false);
    expect(call.response.conflict?.acceptedVersion).toBe("15");
    expect(calls).toHaveLength(1);
  });

  it("403 (suspendare) se oprește definitiv", async () => {
    vi.stubGlobal("fetch", respond([{ status: 403, body: { error: { code: "suspended" } } }]));
    const call = await run(
      putLaCheieAgency(config(), { externalId: "hbt-1", payload: PROFILE, version: "3" }),
    );
    expect(call.response.ok).toBe(false);
    expect(call.response.classification?.action).toBe("stop");
    expect(calls).toHaveLength(1);
  });

  it("GET /agencies raportează statusul real și versiunea acceptată", async () => {
    vi.stubGlobal(
      "fetch",
      respond([{ status: 200, body: { agency: { status: "suspended", version: "9" } } }]),
    );
    const call = await run(getLaCheieAgency(config(), { externalId: "hbt-1" }));
    expect(call.agency.status).toBe("suspended");
    expect(call.agency.acceptedVersion).toBe("9");
    expect(calls[0]!.init.method).toBe("GET");
  });

  it("DELETE /agencies trimite versiunea agenției", async () => {
    vi.stubGlobal("fetch", respond([{ status: 200, body: { agency: { status: "inactive" } } }]));
    const call = await run(deleteLaCheieAgency(config(), { externalId: "hbt-1", version: "10" }));
    expect(call.agency.status).toBe("inactive");
    expect(calls[0]!.init.method).toBe("DELETE");
    expect(headersOf(0).get("x-source-version")).toBe("10");
  });

  it("5xx reia EXACT aceeași versiune și același corp", async () => {
    vi.stubGlobal("fetch", respond([{ status: 503 }, { status: 200 }]));
    await run(putLaCheieAgency(config(), { externalId: "hbt-1", payload: PROFILE, version: "4" }));
    expect(calls).toHaveLength(2);
    expect(calls[0]!.init.body).toBe(calls[1]!.init.body);
    expect(headersOf(1).get("x-source-version")).toBe("4");
  });

  it("429 respectă Retry-After și reia identic", async () => {
    vi.stubGlobal(
      "fetch",
      respond([{ status: 429, headers: { "retry-after": "1" } }, { status: 200 }]),
    );
    const call = await run(
      putLaCheieAgency(config(), { externalId: "hbt-1", payload: PROFILE, version: "5" }),
    );
    expect(call.response.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(headersOf(1).get("x-source-version")).toBe("5");
  });

  it("statusul necunoscut din răspuns nu devine „activ” din presupunere", () => {
    expect(parseLaCheieAgencyBody({}).status).toBe("not_registered");
    expect(parseLaCheieAgencyBody({ status: "suspended" }).status).toBe("suspended");
  });
});

describe("La Cheie — X-Agency-External-ID și izolarea agențiilor", () => {
  it("/account și /properties trimit identificatorul agenției", async () => {
    vi.stubGlobal("fetch", respond([{ status: 200 }]));
    await run(laCheieRequest(config(), { method: "GET", path: "/account" }));
    expect(headersOf(0).get(LACHEIE_AGENCY_HEADER.toLowerCase())).toBe(
      laCheieAgencyExternalId(ORG),
    );
  });

  it("catalogul folosește doar cheia de furnizor, fără identificator de agenție", async () => {
    vi.stubGlobal("fetch", respond([{ status: 200 }]));
    await run(laCheieRequest(config(), { method: "GET", path: "/options", scope: "provider" }));
    const headers = headersOf(0);
    expect(headers.get("authorization")).toBe("Bearer lc_crm_super-secret");
    expect(headers.get(LACHEIE_AGENCY_HEADER.toLowerCase())).toBeNull();
  });

  it("fără identificator de agenție, cererile de ofertă nu pleacă", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(
      laCheieRequest(config({ agencyExternalId: null }), {
        method: "POST",
        path: "/properties",
        body: {},
      }),
    ).rejects.toBeInstanceOf(PortalError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("două agenții diferite trimit identificatori diferiți cu aceeași cheie", async () => {
    vi.stubGlobal("fetch", respond([{ status: 200 }]));
    await run(
      laCheieRequest(config({ agencyExternalId: "hbt-a" }), { method: "GET", path: "/account" }),
    );
    await run(
      laCheieRequest(config({ agencyExternalId: "hbt-b" }), { method: "GET", path: "/account" }),
    );
    expect(headersOf(0).get(LACHEIE_AGENCY_HEADER.toLowerCase())).toBe("hbt-a");
    expect(headersOf(1).get(LACHEIE_AGENCY_HEADER.toLowerCase())).toBe("hbt-b");
    expect(headersOf(0).get("authorization")).toBe(headersOf(1).get("authorization"));
  });
});

describe("La Cheie — protecția cheii de furnizor și regresii", () => {
  const sources = [
    "src/lib/portals/lacheie.functions.ts",
    "src/lib/portals/lacheie/agency.ts",
    "src/lib/portals/lacheie/agency.server.ts",
    "src/lib/portals/lacheie/config.ts",
    "src/lib/portals/adapters/lacheie.server.ts",
    "src/components/superadmin/LaCheieCard.tsx",
  ].map((path) => ({ path, code: readFileSync(path, "utf8") }));

  it("cheia de furnizor se citește doar din secretul de server", () => {
    const credentials = readFileSync("src/lib/portals/lacheie/credentials.server.ts", "utf8");
    expect(credentials).toContain('const SECRET_NAME = "LACHEIE_CRM_API_KEY"');
    expect(credentials).toContain("process.env[SECRET_NAME]");
    for (const { path, code } of sources) {
      expect(code, path).not.toContain("lc_crm_super-secret");
      expect(code, path).not.toMatch(/process\.env\[["']LACHEIE_CRM_API_KEY["']\]/);
    }
  });

  it("interfața nu cere și nu afișează cheia de furnizor", () => {
    const card = readFileSync("src/components/superadmin/LaCheieCard.tsx", "utf8");
    expect(card).toContain("hasProviderKey");
    expect(card).not.toMatch(/type="password"/);
    expect(card).not.toMatch(/apiKey|credential/i);
  });

  it("nu există mediu sau adresă de test pentru La Cheie", () => {
    for (const { path, code } of sources) {
      expect(code, path).not.toMatch(/testBaseUrl|test_base_url/);
      // `config.ts` doar documentează și neutralizează eroarea istorică de TEST.
      if (path.endsWith("config.ts")) continue;
      expect(code, path).not.toMatch(/mediu(l)? de test/i);
    }
  });

  it("jurnalul salvează request_id, status și răspunsul portalului", () => {
    const functions = readFileSync("src/lib/portals/lacheie.functions.ts", "utf8");
    expect(functions).toContain("request_id");
    expect(functions).toContain("portal_response");
    expect(functions).toContain("http_status");
  });
});

describe("La Cheie — emailul verificat al administratorului", () => {
  const base = { emailConfirmedAt: "2026-01-01T00:00:00Z" };

  it("folosește emailul propriu al agency_admin-ului care declanșează activarea", () => {
    const selection = selectLaCheieAdminEmail([
      { userId: "owner", email: "owner@agentie.ro", ...base, isOwner: true },
      { userId: "actor", email: "actor@agentie.ro", ...base, isActor: true },
    ]);
    expect(selection).toEqual({
      ok: true,
      email: "actor@agentie.ro",
      userId: "actor",
      source: "actor",
    });
  });

  it("superadmin → emailul verificat al owner-ului, apoi primul agency_admin", () => {
    const withOwner = selectLaCheieAdminEmail([
      { userId: "a", email: "a@agentie.ro", ...base, roleGrantedAt: "2026-02-01T00:00:00Z" },
      { userId: "owner", email: "owner@agentie.ro", ...base, isOwner: true },
    ]);
    expect(withOwner.ok && withOwner.source).toBe("owner");

    const withoutOwner = selectLaCheieAdminEmail([
      { userId: "b", email: "b@agentie.ro", ...base, roleGrantedAt: "2026-03-01T00:00:00Z" },
      { userId: "a", email: "a@agentie.ro", ...base, roleGrantedAt: "2026-01-05T00:00:00Z" },
    ]);
    expect(withoutOwner.ok && withoutOwner.userId).toBe("a");
    expect(withoutOwner.ok && withoutOwner.source).toBe("first_admin");
  });

  it("niciun email verificat → blocaj cu mesaj clar, fără substituiri", () => {
    const neverConfirmed = selectLaCheieAdminEmail([
      { userId: "a", email: "a@agentie.ro", emailConfirmedAt: null },
      { userId: "b", email: null, emailConfirmedAt: "2026-01-01T00:00:00Z" },
    ]);
    expect(neverConfirmed.ok).toBe(false);
    if (!neverConfirmed.ok) expect(neverConfirmed.reason).toMatch(/VERIFICAT/);
    expect(selectLaCheieAdminEmail([]).ok).toBe(false);
  });

  it("emailul agenției nu mai este sursa: doar adminEmail ajunge în payload", () => {
    const code = readFileSync("src/lib/portals/lacheie.functions.ts", "utf8");
    expect(code).not.toMatch(/material_email/);
    expect(code).toContain("resolveLaCheieAdminEmail");
    const model = readFileSync("src/lib/portals/lacheie/agency.ts", "utf8");
    expect(model).not.toMatch(/materialEmail/);
  });
});

describe("La Cheie — operații idempotente pe agenție", () => {
  const state = readLaCheieAgencyState({
    lacheie_agency_external_id: "hbt-1",
    lacheie_agency_status: "active",
    lacheie_agency_version: "4",
    lacheie_agency_accepted_version: "4",
  });

  it("reactivarea se decide din versiunea ACCEPTATĂ, nu din cea rezervată local", () => {
    const failedFirstRegistration = readLaCheieAgencyState({
      lacheie_agency_external_id: "hbt-1",
      lacheie_agency_status: "error",
      lacheie_agency_version: "1",
    });
    expect(isLaCheieAgencyReactivation(failedFirstRegistration)).toBe(false);
    expect(isLaCheieAgencyReactivation(state)).toBe(true);
  });

  it("un retry al aceleiași operații refolosește versiunea și corpul", async () => {
    const hash = await laCheieAgencyBodyHash("register", PROFILE);
    const first = planLaCheieAgencyOperation({
      state: readLaCheieAgencyState({}),
      pending: null,
      operation: "register",
      bodyHash: hash,
    });
    expect(first).toEqual({ operation: "register", version: "1", reused: false });

    const pending = readLaCheieAgencyPending(laCheieAgencyPendingPatch(first, hash, "now"));
    expect(pending).toMatchObject({ operation: "register", version: "1", bodyHash: hash });
    const retry = planLaCheieAgencyOperation({
      state: readLaCheieAgencyState({}),
      pending,
      operation: "register",
      bodyHash: hash,
    });
    expect(retry).toEqual({ operation: "register", version: "1", reused: true });
  });

  it("un corp sau o operație diferită alocă o versiune nouă", async () => {
    const hash = await laCheieAgencyBodyHash("reactivate", PROFILE);
    const other = await laCheieAgencyBodyHash("reactivate", { ...PROFILE, phone: "0722000112" });
    expect(other).not.toBe(hash);
    const pending = readLaCheieAgencyPending(
      laCheieAgencyPendingPatch({ operation: "reactivate", version: "5", reused: false }, hash, "n"),
    );
    expect(
      planLaCheieAgencyOperation({ state, pending, operation: "reactivate", bodyHash: other }),
    ).toEqual({ operation: "reactivate", version: "5", reused: false });
    expect(
      planLaCheieAgencyOperation({ state, pending, operation: "deactivate", bodyHash: hash }),
    ).toEqual({ operation: "deactivate", version: "5", reused: false });
  });

  it("timeout/5xx/429 păstrează operația pending; răspunsul definitiv o închide", () => {
    for (const httpStatus of [0, 429, 500, 503]) {
      const outcome = classifyLaCheieAgencyPut({
        httpStatus,
        body: null,
        previousStatus: "inactive",
      });
      expect(outcome.keepPending, String(httpStatus)).toBe(true);
      expect(outcome.definitive, String(httpStatus)).toBe(false);
      expect(outcome.status, String(httpStatus)).toBe("inactive");
    }
    for (const httpStatus of [200, 201, 400, 403, 409]) {
      const outcome = classifyLaCheieAgencyPut({
        httpStatus,
        body: httpStatus === 409 ? { error: { code: "conflict" } } : { status: "active" },
        previousStatus: "inactive",
      });
      expect(outcome.definitive, String(httpStatus)).toBe(true);
      expect(outcome.keepPending, String(httpStatus)).toBe(false);
    }
  });
});

describe("La Cheie — răspunsurile PUT/DELETE /agencies", () => {
  it("201/200 citesc status și source_version din rădăcina corpului", () => {
    const created = classifyLaCheieAgencyPut({
      httpStatus: 201,
      body: { external_id: "hbt-1", agency: { id: 211, name: "Test" }, status: "active", source_version: 1 },
      previousStatus: "not_registered",
    });
    expect(created.status).toBe("active");
    expect(created.acceptedVersion).toBe("1");

    const reactivated = classifyLaCheieAgencyPut({
      httpStatus: 200,
      body: { status: "active", source_version: 6 },
      previousStatus: "inactive",
    });
    expect(reactivated.status).toBe("active");
    expect(reactivated.acceptedVersion).toBe("6");
  });

  it("403 → suspendare administrativă, cu mesajul cerut", () => {
    const outcome = classifyLaCheieAgencyPut({
      httpStatus: 403,
      body: { error: { code: "suspended" } },
      previousStatus: "inactive",
    });
    expect(outcome.status).toBe("suspended");
    expect(outcome.message).toBe(LACHEIE_AGENCY_SUSPENDED_MESSAGE);
    expect(outcome.versionConflict).toBe(false);
  });

  it("409 pe versiune permite reluarea; 409 pe asociere nu", () => {
    const versionConflict = classifyLaCheieAgencyPut({
      httpStatus: 409,
      body: {},
      conflictAcceptedVersion: "9",
      previousStatus: "active",
    });
    expect(versionConflict.versionConflict).toBe(true);
    expect(versionConflict.acceptedVersion).toBe("9");
    expect(versionConflict.status).toBe("active");

    const association = classifyLaCheieAgencyPut({
      httpStatus: 409,
      body: { error: { code: "email_in_use", message: "Contul aparține unui agent." } },
      previousStatus: "not_registered",
    });
    expect(association.versionConflict).toBe(false);
    expect(association.status).toBe("error");
    expect(association.message).toBe(LACHEIE_AGENCY_ASSOCIATION_CONFLICT_MESSAGE);
  });

  it("DELETE citește statusul din răspuns și păstrează suspendarea", () => {
    expect(
      laCheieAgencyStatusAfterDelete({
        httpStatus: 200,
        body: { status: "suspended" },
        previousStatus: "suspended",
      }),
    ).toEqual({ ok: true, status: "suspended", keepPending: false });
    expect(
      laCheieAgencyStatusAfterDelete({
        httpStatus: 200,
        body: { status: "inactive" },
        previousStatus: "active",
      }),
    ).toEqual({ ok: true, status: "inactive", keepPending: false });
    // 404 = deja inactivă.
    expect(
      laCheieAgencyStatusAfterDelete({ httpStatus: 404, body: null, previousStatus: "active" }),
    ).toEqual({ ok: true, status: "inactive", keepPending: false });
    expect(
      laCheieAgencyStatusAfterDelete({ httpStatus: 503, body: null, previousStatus: "active" }),
    ).toEqual({ ok: false, status: "active", keepPending: true });
  });

  it("dezactivarea marchează local ofertele La Cheie ca retrase (client simulat)", async () => {
    const calls: { table: string; patch: Record<string, unknown>; filters: [string, unknown][] }[] =
      [];
    const client = {
      from(table: string) {
        const filters: [string, unknown][] = [];
        let patch: Record<string, unknown> = {};
        const chain = {
          eq(column: string, value: unknown) {
            filters.push([column, value]);
            if (filters.length === 2) {
              calls.push({ table, patch, filters });
              return Promise.resolve({ error: null });
            }
            return chain;
          },
        };
        return {
          update(next: Record<string, unknown>) {
            patch = next;
            return chain as never;
          },
        };
      },
    };

    const result = await markLaCheieListingsWithdrawn(client as never, ORG, "actor-1");
    expect(result).toEqual({ ok: true, error: null });
    expect(calls).toEqual([
      {
        table: "portal_listings",
        patch: { status: "withdrawn", updated_by: "actor-1" },
        filters: [
          ["organization_id", ORG],
          ["portal", "lacheie"],
        ],
      },
      {
        table: "portal_publications",
        patch: { status: "withdrawn", updated_by: "actor-1" },
        filters: [
          ["organization_id", ORG],
          ["portal_key", "lacheie"],
        ],
      },
    ]);
  });

  it("erorile de la baza de date NU sunt ignorate", async () => {
    const failing = {
      from(table: string) {
        const chain = {
          eq(_column: string, _value: unknown) {
            return table === "portal_listings"
              ? Promise.resolve({ error: { message: "permission denied" } })
              : chain;
          },
        };
        return { update: () => ({ eq: () => chain as never }) };
      },
    };
    const result = await markLaCheieListingsWithdrawn(failing as never, ORG, null);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("permission denied");
  });
});


describe("La Cheie — 409: conflict de versiune vs. conflict de asociere", () => {
  it("un 409 de asociere care conține source_version NU este tratat ca versiune", () => {
    const outcome = classifyLaCheieAgencyPut({
      httpStatus: 409,
      body: {
        error: {
          code: "agency_already_connected",
          message: "Agenția are deja o conexiune individuală.",
        },
        source_version: 3,
      },
      previousStatus: "not_registered",
    });
    expect(outcome.versionConflict).toBe(false);
    expect(outcome.status).toBe("error");
    expect(outcome.message).toBe(LACHEIE_AGENCY_ASSOCIATION_CONFLICT_MESSAGE);
  });

  it("doar un cod de conflict de versiune (sau versiunea acceptată) permite reluarea", () => {
    const byCode = classifyLaCheieAgencyPut({
      httpStatus: 409,
      body: { error: { code: "version_conflict" } },
      previousStatus: "active",
    });
    expect(byCode.versionConflict).toBe(true);

    const byAccepted = classifyLaCheieAgencyPut({
      httpStatus: 409,
      body: {},
      conflictAcceptedVersion: "7",
      previousStatus: "active",
    });
    expect(byAccepted.versionConflict).toBe(true);
    expect(byAccepted.acceptedVersion).toBe("7");
  });
});

describe("La Cheie — separarea drepturilor de acces", () => {
  const code = readFileSync("src/lib/portals/lacheie.functions.ts", "utf8");
  const fn = (name: string) => {
    const start = code.indexOf(`export const ${name} = createServerFn`);
    expect(start, name).toBeGreaterThan(-1);
    const next = code.indexOf("export const ", start + 10);
    return code.slice(start, next === -1 ? code.length : next);
  };

  it("activarea și starea proprie sunt permise administratorului agenției", () => {
    for (const name of ["activateLaCheieAgency", "getLaCheieAgencyStatusForAgency"]) {
      expect(fn(name), name).toContain("requireLaCheieActivator");
      expect(fn(name), name).not.toContain("await requireSuperadmin(");
    }
  });

  it("administrarea rămâne strict la Superadmin", () => {
    for (const name of [
      "getLaCheieState",
      "refreshLaCheieAgencyStatus",
      "deactivateLaCheieAgency",
      "testLaCheieConnection",
      "refreshLaCheieCatalog",
    ]) {
      expect(fn(name), name).toContain("requireSuperadmin(");
      expect(fn(name), name).not.toContain("requireLaCheieActivator");
    }
  });

  it("pentru non-superadmini agenția vine din sesiune, nu din datele clientului", () => {
    const helper = code.slice(
      code.indexOf("async function requireLaCheieActivator"),
      code.indexOf("async function connectionRow"),
    );
    // Ramura non-superadmin folosește doar user_id-ul din sesiune.
    const nonSuperadmin = helper.slice(helper.indexOf('.from("user_roles")'));
    expect(nonSuperadmin).toContain('.eq("user_id", context.userId)');
    expect(nonSuperadmin).toContain('.eq("role", "agency_admin")');
    expect(nonSuperadmin).not.toContain("requestedOrganizationId");
    // Un agent (fără rol de agency_admin) este refuzat explicit.
    expect(helper).toContain("Acces refuzat");
  });

  it("starea pentru agenție nu expune jurnal, versiuni, corpuri sau chei", () => {
    const self = fn("getLaCheieAgencyStatusForAgency");
    for (const forbidden of [
      "portal_operation_logs",
      "portal_listing_versions",
      "apiKey",
      "credentials.server",
      "bodyHash",
      "acceptedVersion",
    ]) {
      expect(self, forbidden).not.toContain(forbidden);
    }
  });

  it("activarea are limită de o cerere la 30 de secunde pe agenție", () => {
    expect(fn("activateLaCheieAgency")).toContain("activationTooSoon");
    expect(code).toContain("Date.now() - 30_000");
  });
});
