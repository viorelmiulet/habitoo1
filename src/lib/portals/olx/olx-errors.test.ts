/** Erorile OLX exacte — doar mock-uri. */
import { describe, expect, it, vi } from "vitest";

const inserts: Record<string, unknown>[] = [];
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ insert: async (row: Record<string, unknown>) => void inserts.push(row) }) },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

import { createOlxDirectAdapter, olxFail } from "../adapters/olx-direct.server";
import { OlxHttpError } from "./errors";
import type { PortalContext } from "../adapter";

const ctx = { organizationId: "org", allowLiveRequests: true, settings: {} } as unknown as PortalContext;
const body400 = {
  error: {
    status: 400,
    title: "Data validation error occurred",
    detail: "Invalid advert",
    validation: [{ field: "title", title: "Too many capital letters" }, { field: "price.value", detail: "Must be positive" }],
  },
};

function adapter(overrides: Partial<Parameters<typeof createOlxDirectAdapter>[0]> = {}) {
  return createOlxDirectAdapter({
    request: async () => { throw new OlxHttpError(400, body400); },
    loadProperty: async () => ({ ok: false, reasons: ["x"] }),
    loadTaxonomy: async () => ({}),
    notifyError: async () => undefined,
    armStatusCron: async () => undefined,
    ...overrides,
  });
}

describe("erori OLX exacte", () => {
  it("HTTP 400 cu validation[] → status, title, detail și fiecare câmp", () => {
    const f = olxFail(new OlxHttpError(400, body400), "trimiterea anunțului");
    expect(f.message).toBe(
      "OLX.ro (cont prepaid) – trimiterea anunțului: HTTP 400 Data validation error occurred; Invalid advert; title: Too many capital letters; price.value: Must be positive",
    );
    expect(f.httpStatus).toBe(400);
    expect(f.detail).toBe("olx_http_400");
    expect(f.portalResponse).toEqual(body400);
  });

  it("excepție internă → mesajul real, nu textul generic, cu pasul corect", async () => {
    const a = adapter({
      loadProperty: async () => ({ ok: true, deleted: false, city: null, county: null, property: {} as never }),
      loadTaxonomy: async () => { throw new TypeError("Illegal invocation"); },
    });
    const r = await a.publishListing(ctx, { propertyId: "p", externalId: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toBe("OLX.ro (cont prepaid) – încărcarea categoriilor OLX: Illegal invocation");
    expect(r.message).not.toMatch(/Reîncearcă mai târziu/);
  });

  it("secretele din excepții sunt mascate", () => {
    const f = olxFail(new Error("failed with Bearer abc.def-123"), "testul conexiunii");
    expect(f.message).not.toContain("abc.def");
  });

  it("prefixul portalului apare o singură dată", async () => {
    const { withPortalPrefixOnce } = await import("@/lib/portals.functions");
    const n = "OLX.ro (cont prepaid)";
    expect(withPortalPrefixOnce([n], `${n}: ${n}: Ceva`)).toBe(`${n}: Ceva`);
    expect(withPortalPrefixOnce([n], `${n} – găsirea localității: HTTP 404`)).toBe(`${n} – găsirea localității: HTTP 404`);
    expect(withPortalPrefixOnce([n], `${n}: ${n} – trimiterea anunțului: HTTP 400`)).toBe(`${n} – trimiterea anunțului: HTTP 400`);
  });

  it("jurnalul primește http_status, error_code tehnic și portal_response", async () => {
    const { logOperation } = await import("@/lib/portals.functions");
    const f = olxFail(new OlxHttpError(400, body400), "trimiterea anunțului");
    await logOperation({
      organizationId: "org", portal: "olx_direct", operation: "publish", success: false,
      errorCode: f.detail, errorMessage: f.message, httpStatus: f.httpStatus, portalResponse: f.portalResponse,
    });
    const row = inserts.at(-1)!;
    expect(row["http_status"]).toBe(400);
    expect(row["error_code"]).toBe("olx_http_400");
    expect(row["error_message"]).toBe(f.message);
    expect(JSON.stringify(row["portal_response"])).toContain("Too many capital letters");
  });
});
