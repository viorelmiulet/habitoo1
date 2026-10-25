/**
 * Handler-ele tabului Argus (răspunsuri simulate, fără apeluri reale):
 * filtrele se traduc corect, telefonul se cere doar la click, iar o agenție
 * fără Argus conectat primește mesajul de conectare.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  load: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder: Record<string, unknown> = {};
    builder.middleware = () => builder;
    builder.inputValidator = (v: unknown) => {
      builder._v = v;
      return builder;
    };
    builder.handler =
      (fn: (args: { data?: unknown; context: unknown }) => unknown) =>
      async (args: { data?: unknown; context: unknown }) =>
        fn({ ...args, data: builder._v ? (builder._v as (d: unknown) => unknown)(args.data) : args.data });
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeader: () => null,
  setResponseHeader: () => {},
  setResponseStatus: () => {},
}));
vi.mock("@/lib/org-access", () => ({ requireActiveOrgAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ insert: async () => ({ error: null }) }) },
}));
vi.mock("./connection.server", () => ({
  argusCall: mocks.call,
  loadArgusConnection: mocks.load,
}));

import {
  searchArgusListings,
  getArgusListingDetail,
  getArgusListingContact,
  getArgusTabStatus,
} from "./argus.functions";

type Handler = (args: { data?: unknown; context: unknown }) => Promise<unknown>;

function agentCtx(orgId = "org-1") {
  const from = vi.fn(() => {
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({ data: { organization_id: orgId }, error: null }),
    };
    return q;
  });
  return { supabase: { from }, userId: "agent-1" };
}

const SEARCH_RESPONSE = {
  properties: [
    {
      property_id: "P1",
      title: "apartament proprietar",
      last_price: 500,
      last_date: "2026-10-25 08:00:00",
      last_source_name: "olx.ro",
      last_site_link: "https://www.olx.ro/anunt",
      details: { rooms: 2, living_area: 48 },
      location: { county: "București", city: "București", area: "Titan" },
      phone_numbers: ["+40 700 000 000"],
    },
  ],
  total: 1,
};

beforeEach(() => vi.clearAllMocks());

describe("căutarea Argus din tab", () => {
  it("traduce filtrele și trimite implicit doar anunțuri de la proprietari", async () => {
    mocks.call.mockResolvedValue(SEARCH_RESPONSE);
    const result = (await (searchArgusListings as unknown as Handler)({
      data: { transaction: "rent", countyId: 40, cityId: 17913, areaIds: [5], priceMax: 600, page: 2 },
      context: agentCtx("org-9"),
    })) as { items: unknown[]; total: number };
    expect(mocks.call).toHaveBeenCalledWith(
      expect.anything(),
      "org-9",
      expect.objectContaining({
        path: "/properties/search",
        body: {
          page: 2,
          transaction_type: [2],
          budget: [0, 600],
          listed_by: [1],
          counties: [40],
          cities: [17913],
          areas: [5],
        },
      }),
    );
    expect(result.total).toBe(1);
    expect(JSON.stringify(result)).not.toContain("700 000");
  });

  it("o pagină de rezultate face exact o cerere la Argus", async () => {
    mocks.call.mockResolvedValue({
      properties: [{ ...SEARCH_RESPONSE.properties[0], has_image: true }, { ...SEARCH_RESPONSE.properties[0], property_id: "P2", has_image: true }],
      total: 2,
    });
    const result = (await (searchArgusListings as unknown as Handler)({ data: {}, context: agentCtx() })) as {
      items: { hasImage: boolean }[];
    };
    expect(mocks.call).toHaveBeenCalledTimes(1);
    expect(mocks.call.mock.calls[0]![2].path).toBe("/properties/search");
    expect(result.items.every((i) => i.hasImage)).toBe(true);
  });

  it("opțiunea „Toți” omite filtrul listed_by", async () => {
    mocks.call.mockResolvedValue({ properties: [], total: 0 });
    await (searchArgusListings as unknown as Handler)({
      data: { listedBy: "all" },
      context: agentCtx(),
    });
    const body = mocks.call.mock.calls[0]![2].body as Record<string, unknown>;
    expect(body).not.toHaveProperty("listed_by");
  });

  it("o agenție fără Argus conectat primește eroarea de conectare", async () => {
    const { ArgusError } = await import("./errors");
    mocks.call.mockRejectedValue(
      new ArgusError("config", "Agenția nu are o cheie API Argus salvată. Adaug-o în Setări → Integrări → Argus."),
    );
    await expect(
      (searchArgusListings as unknown as Handler)({ data: {}, context: agentCtx() }),
    ).rejects.toThrow("Setări → Integrări → Argus");
  });
});

describe("detaliul și telefonul", () => {
  it("detaliul nu cere niciodată /properties/contact", async () => {
    mocks.call.mockResolvedValue({
      ...SEARCH_RESPONSE.properties[0],
      description: "Descriere",
      has_image: true,
      images: [{ File: "https://cdn.argus.me/1.jpg", Thumb: null }],
    });
    const detail = (await (getArgusListingDetail as unknown as Handler)({
      data: { propertyId: "P1" },
      context: agentCtx(),
    })) as Record<string, unknown>;
    expect(detail).toMatchObject({ id: "P1", description: "Descriere" });
    const paths = mocks.call.mock.calls.map((c) => (c[2] as { path: string }).path);
    expect(paths).toEqual(["/properties/detail", "/properties/images"]);
    expect(paths).not.toContain("/properties/contact");
    expect(JSON.stringify(detail)).not.toContain("700 000");
  });

  it("telefonul se cere doar prin funcția de contact, la click", async () => {
    mocks.call.mockResolvedValue({ phone_numbers: ["+40 700 000 000"] });
    const result = (await (getArgusListingContact as unknown as Handler)({
      data: { propertyId: "P1" },
      context: agentCtx(),
    })) as { phones: string[] };
    expect(mocks.call).toHaveBeenCalledTimes(1);
    expect(mocks.call).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      expect.objectContaining({ path: "/properties/contact", method: "GET" }),
    );
    expect(result.phones).toEqual(["+40 700 000 000"]);
  });
});

describe("starea conexiunii pentru tab", () => {
  it("agenția fără Argus conectat vede connected: false", async () => {
    mocks.load.mockResolvedValue(null);
    const status = (await (getArgusTabStatus as unknown as Handler)({
      context: agentCtx(),
    })) as { configured: boolean; connected: boolean };
    expect(status.connected).toBe(false);
    expect(mocks.load).toHaveBeenCalledWith(expect.anything(), "org-1");
  });

  it("agenția conectată vede connected: true, fără date sensibile", async () => {
    mocks.load.mockResolvedValue({
      organization_id: "org-1",
      api_key_enc: "enc:secret",
      api_key_last4: "cret",
      token_enc: "enc:token",
    });
    const status = (await (getArgusTabStatus as unknown as Handler)({
      context: agentCtx(),
    })) as { connected: boolean };
    expect(status.connected).toBe(true);
    expect(JSON.stringify(status)).not.toContain("secret");
  });
});
