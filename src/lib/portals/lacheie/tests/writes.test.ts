/**
 * Reguli de scriere a ofertelor La Cheie (secțiunile 3, 5, 6 din ghid):
 * PUT pentru creare și actualizare, 404 fără reluare, 409 cu reconciliere sau
 * conflict de asociere, retrimitere identică la nivel de octeți, imagini publice
 * permanente, câmpuri interzise și limite pentru agent.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LACHEIE_FORBIDDEN_FIELDS,
  LACHEIE_MAX_IMAGE_URL_LENGTH,
  isValidExternalId,
  laCheieDecimal,
  sanitizeLaCheieImages,
} from "../mapper";
import { isLaCheieAssociationConflict } from "../http";
import { laCheieOfferVersionFromBody } from "../version";
import { laCheieRequest } from "../client.server";

const ADAPTER = readFileSync("src/lib/portals/adapters/lacheie.server.ts", "utf8");

describe("La Cheie — scrieri PUT-only", () => {
  it("adaptorul nu mai folosește POST /properties și nici fallback pe 404", () => {
    expect(ADAPTER).not.toMatch(/method:\s*"POST",\s*\n\s*path,/);
    expect(ADAPTER).toMatch(/method:\s*"PUT"/);
    expect(ADAPTER).not.toMatch(/mode === "create"\s*\n?\s*\?\s*laCheieRequest/);
  });

  it("conflictul de asociere este distins de conflictul de versiune", () => {
    expect(isLaCheieAssociationConflict({ error: { code: "agent_association_conflict" } })).toBe(
      true,
    );
    expect(
      isLaCheieAssociationConflict({ error: { message: "Asociere invalidă a agentului" } }),
    ).toBe(true);
    expect(isLaCheieAssociationConflict({ error: { code: "version_conflict" } })).toBe(false);
    expect(isLaCheieAssociationConflict({ accepted_version: "12" })).toBe(false);
  });

  it("versiunea acceptată se poate citi din GET /properties/{external_id}", () => {
    expect(laCheieOfferVersionFromBody({ offer: { source_version: "31" } })).toBe("31");
    expect(laCheieOfferVersionFromBody({ source_version: 12 })).toBe("12");
    expect(laCheieOfferVersionFromBody({})).toBeNull();
  });

  it("adaptorul cere „Contactați La Cheie” cu request_id la conflict de asociere", () => {
    expect(ADAPTER).toContain("Contactați La Cheie");
    expect(ADAPTER).toContain("request_id");
  });
});

describe("La Cheie — retrimitere identică", () => {
  const calls: { init: RequestInit }[] = [];

  beforeEach(() => {
    calls.length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("două încercări trimit EXACT aceiași octeți și aceeași versiune", async () => {
    let index = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push({ init });
        index += 1;
        return new Response("{}", { status: index === 1 ? 503 : 200 });
      }),
    );
    const promise = laCheieRequest(
      {
        baseUrl: "https://api.lacheie.ro/api/partners/v1",
        apiKey: "k",
        environment: "production",
        agencyExternalId: "hbt-org-1",
        connectionKey: `writes-${Math.random()}`,
      },
      {
        method: "PUT",
        path: "/properties/HBT-1-SALE",
        body: { price: "125000.00", number_of_rooms: 3 },
        sourceVersion: "9",
      },
    );
    await vi.runAllTimersAsync();
    const response = await promise;
    expect(response.ok).toBe(true);
    expect(calls).toHaveLength(2);
    const first = calls[0]!.init.body as string;
    const second = calls[1]!.init.body as string;
    expect(second).toBe(first);
    expect(new TextEncoder().encode(second)).toEqual(new TextEncoder().encode(first));
    expect(first).toContain('"price":"125000.00"');
    const v1 = new Headers(calls[0]!.init.headers as HeadersInit).get("x-source-version");
    const v2 = new Headers(calls[1]!.init.headers as HeadersInit).get("x-source-version");
    expect(v2).toBe(v1);
    expect(v1).toBe("9");
  });
});

describe("La Cheie — payload și imagini", () => {
  it("prețul are format zecimal stabil", () => {
    expect(laCheieDecimal(125000)).toBe("125000.00");
    expect(laCheieDecimal(125000.5)).toBe("125000.50");
  });

  it("numberOfRooms este câmp interzis la nivel superior", () => {
    expect(LACHEIE_FORBIDDEN_FIELDS).toContain("numberOfRooms");
    for (const field of ["agency", "agency_id", "user_id", "promoted_until", "listing_type", "location", "phone"]) {
      expect(LACHEIE_FORBIDDEN_FIELDS).toContain(field);
    }
  });

  it("imaginile peste 500 de caractere sunt respinse", () => {
    const long = `https://crm.habitoo.ro/api/public/sites/v1/media/${"a".repeat(LACHEIE_MAX_IMAGE_URL_LENGTH)}`;
    const result = sanitizeLaCheieImages([long, "https://crm.habitoo.ro/api/public/sites/v1/media/1"]);
    expect(result.images).toEqual(["https://crm.habitoo.ro/api/public/sites/v1/media/1"]);
    expect(result.rejected[0]?.reason).toContain("500");
  });

  it("URL-urile semnate/expirabile rămân respinse", () => {
    const result = sanitizeLaCheieImages([
      "https://storage.example/img.jpg?token=abc&X-Amz-Signature=x",
      "https://crm.habitoo.ro/api/public/sites/v1/media/2",
    ]);
    expect(result.images).toEqual(["https://crm.habitoo.ro/api/public/sites/v1/media/2"]);
  });

  it("external_id respectă formatul documentat", () => {
    expect(isValidExternalId("HBT-1-SALE")).toBe(true);
    expect(isValidExternalId("-HBT")).toBe(false);
    expect(isValidExternalId("HBT 1")).toBe(false);
    expect(isValidExternalId("a".repeat(65))).toBe(false);
  });
});
