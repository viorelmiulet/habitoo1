/**
 * `sendOffer` pe calea PUT: cererea trebuie să conțină corpul ofertei (fără
 * `external_id`). Regresia din 17.09 folosea o variabilă declarată mai jos și
 * arunca înainte de orice cerere; testul acesta ar fi prins-o.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const requests: { method: string; path: string; body: unknown; sourceVersion?: string }[] = [];

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("../version.server", () => ({
  reserveNextVersion: vi.fn(async () => "3"),
  recordVersionOutcome: vi.fn(async () => undefined),
  readVersionRecord: vi.fn(async () => null),
}));
vi.mock("../client.server", () => ({
  withLaCheieWriteLock: async (_key: string, fn: () => Promise<unknown>) => fn(),
  laCheieRequest: vi.fn(async (_config: unknown, input: Record<string, unknown>) => {
    requests.push(input as never);
    return {
      ok: true,
      status: 200,
      body: { offer: { url: "https://lacheie.ro/o/1", status: "published" } },
      classification: null,
    };
  }),
}));

import { sendOffer } from "@/lib/portals/adapters/lacheie.server";

describe("La Cheie — sendOffer PUT", () => {
  beforeEach(() => {
    requests.length = 0;
  });

  it("trimite corpul ofertei, fără external_id, cu versiunea rezervată", async () => {
    const offer = { external_id: "HBT-abc-SALE", title: "Apartament", price: 100000 };
    const result = await sendOffer({
      ctx: { organizationId: "org-1" } as never,
      config: { baseUrl: "https://api.lacheie.ro/api/partners/v1" } as never,
      settings: { environment: "production" } as never,
      offer: offer as never,
      propertyId: "prop-1",
      mode: "update",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].path).toContain("HBT-abc-SALE");
    expect(requests[0].sourceVersion).toBe("3");
    expect(requests[0].body).toEqual({ title: "Apartament", price: 100000 });
    expect(result).toMatchObject({ ok: true, publicUrl: "https://lacheie.ro/o/1" });
  });
});
