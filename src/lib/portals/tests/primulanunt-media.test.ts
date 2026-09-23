/**
 * Teste pentru pozele PrimulAnunț.ro — doar fetch mock, fără apeluri reale.
 *
 * Documentație: `POST /api/public/v1/listings/{id}/media`, `multipart/form-data`,
 * câmpul `file`, max. 20 imagini de 10 MB, `?replace=true` înlocuiește setul.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { uploadListingMedia } from "@/lib/portals/primulanunt/client.server";
import {
  createPrimulAnuntAdapter,
  type PrimulAnuntMediaSource,
} from "@/lib/portals/adapters/primulanunt.server";
import type { PortalContext } from "@/lib/portals/adapter";
import type { PrimulAnuntListingDto, PrimulAnuntMediaFile } from "@/lib/portals/primulanunt/types";

const API_KEY = "pa_live_secret_key_do_not_log";

type Call = { url: string; init: RequestInit };

function mockFetch(responder: (call: Call, index: number) => Response) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call = { url: String(input), init: init ?? {} };
      calls.push(call);
      return responder(call, calls.length - 1);
    }),
  );
  return calls;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const DTO: PrimulAnuntListingDto = {
  external_id: "HB-2001",
  title: "Apartament 2 camere, Cluj-Napoca",
  description: "Descriere completă a anunțului.",
  purpose: "sale",
  property_type: "apartament",
  price: 120000,
  currency: "EUR",
  county: "Cluj",
  city: "Cluj-Napoca",
};

function ctx(overrides: Partial<PortalContext> = {}): PortalContext {
  return {
    organizationId: "org-1",
    definition: { id: "primulanunt" } as PortalContext["definition"],
    direction: "habitoo_to_portal",
    authenticationMode: "portal_api_key",
    externalAccountId: null,
    portalCredential: API_KEY,
    settings: {},
    allowLiveRequests: true,
    ...overrides,
  };
}

function photo(index: number, bytes = 1024): PrimulAnuntMediaFile {
  return {
    imageId: `img-${index}`,
    filename: `foto-${index}.jpg`,
    contentType: "image/jpeg",
    bytes: new Uint8Array(bytes),
  };
}

function mediaSource(files: PrimulAnuntMediaFile[], warnings: string[] = []): PrimulAnuntMediaSource {
  return async () => ({ files, warnings });
}

function adapterWith(media: PrimulAnuntMediaSource) {
  return createPrimulAnuntAdapter(async () => ({ ok: true, dto: DTO }), media);
}

async function filesOf(init: RequestInit): Promise<File[]> {
  const form = init.body as FormData;
  return form.getAll("file").filter((entry): entry is File => entry instanceof File);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("upload poze PrimulAnunț.ro", () => {
  it("trimite 3 poze pe calea documentată, cu câmpul file repetat", async () => {
    const calls = mockFetch(() => json({ uploaded: 3, media: [] }));
    const result = await uploadListingMedia(API_KEY, "HB-2001", [photo(1), photo(2), photo(3)]);
    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe(
      "https://www.primulanunt.ro/api/public/v1/listings/HB-2001/media",
    );
    expect(calls[0]?.init.method).toBe("POST");
    const files = await filesOf(calls[0]!.init);
    expect(files.map((f) => f.name)).toEqual(["foto-1.jpg", "foto-2.jpg", "foto-3.jpg"]);
  });

  it("nu pune Content-Type manual (boundary-ul îl scrie runtime-ul)", async () => {
    const calls = mockFetch(() => json({ uploaded: 1 }));
    await uploadListingMedia(API_KEY, "HB-2001", [photo(1)]);
    const headers = new Headers(calls[0]!.init.headers);
    expect(headers.get("content-type")).toBeNull();
    expect(headers.get("authorization")).toBe(`Bearer ${API_KEY}`);
  });

  it("publicarea atașează pozele după crearea anunțului", async () => {
    const calls = mockFetch((_call, index) =>
      index === 0 ? json({ id: "pa-1", external_id: "HB-2001", status: "published" }) : json({ uploaded: 3 }),
    );
    const result = await adapterWith(mediaSource([photo(1), photo(2), photo(3)])).publishListing(
      ctx(),
      { propertyId: "p1", externalId: null },
    );
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.url).toBe("https://www.primulanunt.ro/api/public/v1/listings/pa-1/media");
    expect(result.ok && result.data.detail).toContain("media=3");
  });

  it("la actualizare folosește ?replace=true", async () => {
    const calls = mockFetch((_call, index) =>
      index === 0 ? json({ id: "pa-1", external_id: "HB-2001" }) : json({ uploaded: 2 }),
    );
    await adapterWith(mediaSource([photo(1), photo(2)])).updateListing(ctx(), {
      propertyId: "p1",
      externalId: "HB-2001",
    });
    expect(calls[1]?.url).toBe(
      "https://www.primulanunt.ro/api/public/v1/listings/pa-1/media?replace=true",
    );
  });

  it("zero poze eligibile: succes cu avertisment, fără apel de media", async () => {
    const calls = mockFetch(() => json({ id: "pa-1", external_id: "HB-2001" }));
    const result = await adapterWith(
      mediaSource([], ["Nicio poză publicabilă nu a fost trimisă către PrimulAnunț.ro."]),
    ).publishListing(ctx(), { propertyId: "p1", externalId: null });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(result.ok && result.data.message).toContain("Nicio poză publicabilă");
  });

  it("eroarea de upload lasă anunțul publicat, cu avertisment explicit", async () => {
    mockFetch((_call, index) =>
      index === 0 ? json({ id: "pa-1", external_id: "HB-2001" }) : json({ message: "boom" }, 500),
    );
    const result = await adapterWith(mediaSource([photo(1)])).publishListing(ctx(), {
      propertyId: "p1",
      externalId: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.message).toContain("Anunțul a rămas publicat");
    expect(result.data.message).toContain("pozele nu au putut fi încărcate");
    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });
});

describe("pregătirea pozelor din storage", () => {
  const ORG = {
    logo_path: null,
    watermark_enabled: false,
    watermark_position: "bottom_right",
    watermark_scale_percent: 20,
    watermark_opacity_percent: 70,
    watermark_margin_percent: 3,
  };

  function admin(rows: unknown[], sizes: Record<string, number>) {
    return {
      from(table: string) {
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          order: () => Promise.resolve({ data: rows }),
          maybeSingle: () => Promise.resolve({ data: table === "organizations" ? ORG : null }),
        };
        return builder;
      },
      storage: {
        from: () => ({
          download: async (path: string) => ({
            data: { arrayBuffer: async () => new ArrayBuffer(sizes[path] ?? 1024) },
            error: null,
          }),
        }),
      },
    };
  }

  function row(index: number, extra: Record<string, unknown> = {}) {
    return {
      id: `img-${index}`,
      storage_path: `org/p1/foto-${index}.jpg`,
      position: index,
      include_in_publish: true,
      is_confidential: false,
      is_primary: index === 1,
      ...extra,
    };
  }

  it("taie la primele 20 de poze, păstrând ordinea", async () => {
    const { loadPrimulAnuntMedia } = await import("@/lib/portals/primulanunt/media.server");
    const rows = Array.from({ length: 25 }, (_v, i) => row(i + 1));
    const result = await loadPrimulAnuntMedia({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin: admin(rows, {}) as any,
      organizationId: "org-1",
      propertyId: "p1",
    });
    expect(result.files).toHaveLength(20);
    expect(result.files[0]?.imageId).toBe("img-1");
    expect(result.files[19]?.imageId).toBe("img-20");
    expect(result.warnings.join(" ")).toContain("maximum 20 poze");
  });

  it("exclude pozele confidențiale sau nepublicabile", async () => {
    const { loadPrimulAnuntMedia } = await import("@/lib/portals/primulanunt/media.server");
    const rows = [
      row(1),
      row(2, { include_in_publish: false }),
      row(3, { is_confidential: true }),
    ];
    const result = await loadPrimulAnuntMedia({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin: admin(rows, {}) as any,
      organizationId: "org-1",
      propertyId: "p1",
    });
    expect(result.files.map((f) => f.imageId)).toEqual(["img-1"]);
  });

  it("o poză peste 10 MB este exclusă cu avertisment, restul rămân", async () => {
    const { loadPrimulAnuntMedia } = await import("@/lib/portals/primulanunt/media.server");
    const rows = [row(1), row(2), row(3)];
    const result = await loadPrimulAnuntMedia({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin: admin(rows, { "org/p1/foto-2.jpg": 11 * 1024 * 1024 }) as any,
      organizationId: "org-1",
      propertyId: "p1",
    });
    expect(result.files.map((f) => f.imageId)).toEqual(["img-1", "img-3"]);
    expect(result.warnings.join(" ")).toContain("Poza 2 depășește limita de 10 MB");
  });

  it("fără poze eligibile întoarce doar avertisment", async () => {
    const { loadPrimulAnuntMedia } = await import("@/lib/portals/primulanunt/media.server");
    const result = await loadPrimulAnuntMedia({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin: admin([], {}) as any,
      organizationId: "org-1",
      propertyId: "p1",
    });
    expect(result.files).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
  });
});
