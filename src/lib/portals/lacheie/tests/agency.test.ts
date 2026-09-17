/**
 * Teste pentru modelul de furnizor CRM La Cheie:
 * activare/reactivare agenție, statusuri, versiuni separate, headerul
 * `X-Agency-External-ID`, izolarea între agenții, protecția cheii de furnizor
 * și regresia „fără mediu de test”.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortalError } from "../../errors";
import {
  buildLaCheieAgencyPayload,
  canActivateLaCheieAgency,
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
