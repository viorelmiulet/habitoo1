/**
 * Teste pentru administrarea promovărilor Imobiliare.ro: mapările registrului,
 * inventarul sloturilor, lista anunțurilor pe slot, scrierea parțială,
 * revalidarea la activare, reînnoirea tokenului, izolarea pe agenții și
 * absența oricărei scurgeri de secrete.
 *
 * Nicio modificare reală nu este trimisă către portal: cererile sunt înlocuite
 * cu duble de test (contract tests).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  IMOBILIARE_PROMOTIONS,
  IMOBILIARE_SLOT_TYPES,
  guardImobiliarePromotionChange,
  imobiliareEnergyCeiling,
  imobiliarePromotion,
  imobiliarePromotionBySlot,
  imobiliarePromotionPatch,
  imobiliarePromotionStateFromListing,
  manageableImobiliarePromotions,
  normalizeImobiliareSlotInventory,
  parseImobiliareSlotListings,
} from "../promotions";
import { promotionListingsPath, promotionSlotsPath, promotionsPath } from "../config";

/* ------------------------------- dublă de rețea ---------------------------- */

type Call = { method: string; path: string; body?: unknown; accessToken?: string | null };

const calls: Call[] = [];
let responder: (call: Call) => {
  ok: boolean;
  status: number;
  body: unknown;
  classification?: { code: string; message: string; action?: string } | null;
};

vi.mock("../auth.server", () => ({
  imobiliareAuthedRequest: async (
    session: { accessToken: string; refresh: () => Promise<string | null> },
    input: { method: string; path: string; body?: unknown },
  ) => {
    const call: Call = { ...input, accessToken: session.accessToken };
    calls.push(call);
    const result = responder(call);
    if (result.status === 401) {
      // Comportamentul real: o singură reînnoire, apoi reluarea cererii.
      const token = await session.refresh();
      if (token) {
        const retry: Call = { ...input, accessToken: token };
        calls.push(retry);
        return { ...responder(retry), attempts: 2, durationMs: 1 };
      }
    }
    return { ...result, classification: result.classification ?? null, attempts: 1, durationMs: 1 };
  },
}));

import {
  fetchImobiliareListingPromotions,
  fetchImobiliareSlotInventories,
  fetchImobiliareSlotInventory,
  fetchImobiliareSlotListings,
  setImobiliareListingPromotion,
} from "../promotions.server";

function session(overrides?: { refreshTo?: string | null }) {
  let token = "access-token-secret";
  return {
    get accessToken() {
      return token;
    },
    username: "agentie",
    refresh: async () => {
      const next = overrides?.refreshTo ?? "refreshed-token-secret";
      if (next === null) return null;
      token = next;
      return next;
    },
  } as never;
}

/** Admin fals: blocarea durabilă răspunde cu succes, fără bază de date reală. */
const lockCalls: unknown[][] = [];
const fakeAdmin = {
  rpc: async (fn: string, args: unknown) => {
    lockCalls.push([fn, args]);
    return { data: true, error: null };
  },
} as never;

function ok(body: unknown) {
  return { ok: true, status: 200, body, classification: null };
}

beforeEach(() => {
  calls.length = 0;
  lockCalls.length = 0;
  responder = () => ok({ data: {} });
});

/* --------------------------------- registru -------------------------------- */

describe("registrul de promovări Imobiliare.ro", () => {
  const expected: [string, string | null, string | null][] = [
    ["promo", "promo", "promo"],
    ["tl", "tl", "top_listing"],
    ["tls", "tls", "top_listing_s"],
    ["energy", "energy", "energy"],
    ["bonus", "bonus", "bonus"],
    ["pole_position", "pole_position", "pole_position"],
    ["promote_imoradar", null, "promote_imoradar"],
    ["similar", "similar", "similar_properties"],
    ["month", "month", "properties_of_the_month"],
  ];

  for (const [id, slotType, writeField] of expected) {
    it(`mapează ${id} → slot ${slotType ?? "—"} / câmp ${writeField}`, () => {
      const definition = imobiliarePromotion(id);
      expect(definition).not.toBeNull();
      expect(definition?.slotType).toBe(slotType);
      expect(definition?.writeField).toBe(writeField);
    });
  }

  it("păstrează starter și rotatii DOAR ca inventar, fără câmp de scriere", () => {
    for (const id of ["starter", "rotatii"]) {
      const definition = imobiliarePromotion(id);
      expect(definition?.slotType).toBe(id);
      expect(definition?.writeField).toBeNull();
    }
    expect(manageableImobiliarePromotions().map((p) => p.id)).not.toContain("starter");
    expect(manageableImobiliarePromotions().map((p) => p.id)).not.toContain("rotatii");
  });

  it("nu tratează video_viewing ca promovare", () => {
    expect(IMOBILIARE_PROMOTIONS.some((p) => p.id === "video_viewing")).toBe(false);
    expect(IMOBILIARE_SLOT_TYPES).not.toContain("video_viewing");
  });

  it("expune exact sloturile din Swagger", () => {
    expect(IMOBILIARE_SLOT_TYPES.sort()).toEqual(
      ["bonus", "energy", "month", "pole_position", "promo", "rotatii", "similar", "starter", "tl", "tls"].sort(),
    );
    expect(imobiliarePromotionBySlot("tls")?.writeField).toBe("top_listing_s");
  });

  it("marchează similar și month drept configurabile, restul confirmate", () => {
    expect(imobiliarePromotion("similar")?.source).toBe("configurable");
    expect(imobiliarePromotion("month")?.source).toBe("configurable");
    expect(imobiliarePromotion("tl")?.source).toBe("confirmed");
  });

  it("construiește scrieri PARȚIALE, cu un singur câmp", () => {
    expect(imobiliarePromotionPatch(imobiliarePromotion("tl")!, true)).toEqual({
      promotions: { top_listing: true },
    });
    expect(imobiliarePromotionPatch(imobiliarePromotion("bonus")!, false)).toEqual({
      promotions: { bonus: false },
    });
    expect(imobiliarePromotionPatch(imobiliarePromotion("energy")!, 5)).toEqual({
      promotions: { energy: 5 },
    });
    expect(imobiliarePromotionPatch(imobiliarePromotion("month")!, true)).toEqual({
      promotions: { properties_of_the_month: true },
    });
  });

  it("refuză scrierea pentru serviciile fără câmp confirmat", () => {
    expect(() => imobiliarePromotionPatch(imobiliarePromotion("starter")!, true)).toThrow();
  });

  it("folosește căile documentate", () => {
    expect(promotionSlotsPath("tl")).toBe("/api/v3/promotions/slots/tl");
    expect(promotionListingsPath("pole_position")).toBe(
      "/api/v3/promotions/listings/pole_position",
    );
    expect(promotionsPath("HB-1006")).toBe("/api/v3/listings/HB-1006/promotions");
  });
});

/* --------------------------------- inventar -------------------------------- */

describe("inventarul sloturilor", () => {
  it("normalizează total/used/available", () => {
    expect(normalizeImobiliareSlotInventory("bonus", { data: { total: 3, used: 1 } })).toEqual({
      slotType: "bonus",
      total: 3,
      used: 1,
      available: 2,
    });
  });

  it("nu returnează niciodată available negativ", () => {
    expect(
      normalizeImobiliareSlotInventory("tl", { data: { total: 8, used: 9 } })?.available,
    ).toBe(0);
  });

  it("zero locuri rămâne zero, nu necunoscut", () => {
    expect(normalizeImobiliareSlotInventory("tls", { data: { total: 0, used: 0 } })).toEqual({
      slotType: "tls",
      total: 0,
      used: 0,
      available: 0,
    });
  });

  it("răspuns fără cifre → necunoscut, nu zero", () => {
    expect(normalizeImobiliareSlotInventory("tl", { data: {} })).toBeNull();
    expect(normalizeImobiliareSlotInventory("tl", null)).toBeNull();
  });

  it("citește inventarul live de la portal", async () => {
    responder = () => ok({ data: { total: 8, used: 8 } });
    const result = await fetchImobiliareSlotInventory({
      session: session(),
      organizationId: "org-1",
      slotType: "tl",
    });
    expect(calls[0]?.path).toBe("/api/v3/promotions/slots/tl");
    expect(result.inventory).toEqual({ slotType: "tl", total: 8, used: 8, available: 0 });
    expect(result.syncedAt).not.toBeNull();
  });

  it("un slot indisponibil NU blochează celelalte servicii", async () => {
    responder = (call) =>
      call.path.endsWith("/tls")
        ? { ok: false, status: 503, body: null, classification: { code: "PORTAL_ERROR", message: "Serviciu indisponibil." } }
        : ok({ data: { total: 2, used: 1 } });
    const inventories = await fetchImobiliareSlotInventories({
      session: session(),
      organizationId: "org-1",
      slotTypes: ["tl", "tls", "bonus"],
    });
    expect(inventories.get("tl")?.inventory?.available).toBe(1);
    expect(inventories.get("bonus")?.inventory?.available).toBe(1);
    expect(inventories.get("tls")?.inventory).toBeNull();
    expect(inventories.get("tls")?.error).toContain("indisponibil");
    // Inventarul indisponibil nu este prezentat ca live.
    expect(inventories.get("tls")?.syncedAt).toBeNull();
  });

  it("plafonul Energy = valoarea curentă + locurile libere", () => {
    expect(imobiliareEnergyCeiling({ slotType: "energy", total: 5, used: 5, available: 0 }, 5)).toBe(5);
    expect(imobiliareEnergyCeiling({ slotType: "energy", total: 5, used: 2, available: 3 }, 2)).toBe(5);
    expect(imobiliareEnergyCeiling(null, 2)).toBeNull();
  });
});

/* ------------------------------ anunțuri pe slot --------------------------- */

describe("anunțurile care consumă un slot", () => {
  it("parsează liste directe și împachetate", () => {
    expect(
      parseImobiliareSlotListings({
        data: [{ custom_reference: "HB-1006", id: 275991125, title: "Garsonieră", path: "/oferta/x" }],
      }),
    ).toEqual([
      { reference: "HB-1006", listingId: "275991125", title: "Garsonieră", url: "/oferta/x" },
    ]);
    expect(
      parseImobiliareSlotListings({ data: { items: [{ reference: "HB-1004" }] } })[0]?.reference,
    ).toBe("HB-1004");
    expect(parseImobiliareSlotListings({ data: [] })).toEqual([]);
  });

  it("citește lista reală prin GET /promotions/listings/{slot_type}", async () => {
    responder = () => ok({ data: [{ custom_reference: "HB-1006" }] });
    const result = await fetchImobiliareSlotListings({
      session: session(),
      organizationId: "org-1",
      slotType: "tl",
    });
    expect(calls[0]?.path).toBe("/api/v3/promotions/listings/tl");
    expect(result.ok && result.listings[0]?.reference).toBe("HB-1006");
  });

  it("raportează eroarea reală, fără date fabricate", async () => {
    responder = () => ({
      ok: false,
      status: 500,
      body: null,
      classification: { code: "PORTAL_ERROR", message: "Eroare portal." },
    });
    const result = await fetchImobiliareSlotListings({
      session: session(),
      organizationId: "org-1",
      slotType: "tl",
    });
    expect(result.ok).toBe(false);
  });
});

/* --------------------------- starea pe ofertă ------------------------------ */

describe("starea serviciilor pe ofertă", () => {
  it("citește valorile din anunț", () => {
    const body = { data: { promotions: { top_listing: true, bonus: false, energy: 5 } } };
    expect(imobiliarePromotionStateFromListing(body, imobiliarePromotion("tl")!)).toBe(true);
    expect(imobiliarePromotionStateFromListing(body, imobiliarePromotion("bonus")!)).toBe(false);
    expect(imobiliarePromotionStateFromListing(body, imobiliarePromotion("energy")!)).toBe(5);
  });

  it("lipsa câmpului = necunoscut, nu inactiv", () => {
    expect(
      imobiliarePromotionStateFromListing({ data: { promotions: {} } }, imobiliarePromotion("tl")!),
    ).toBeNull();
    expect(imobiliarePromotionStateFromListing({ data: {} }, imobiliarePromotion("tl")!)).toBeNull();
  });

  it("marchează toate stările necunoscute când anunțul nu poate fi citit", async () => {
    responder = () => ({
      ok: false,
      status: 404,
      body: null,
      classification: { code: "NOT_FOUND", message: "Anunț inexistent." },
    });
    const state = await fetchImobiliareListingPromotions({
      session: session(),
      organizationId: "org-1",
      reference: "HB-1006",
    });
    expect(state.error).toContain("inexistent");
    expect(state.states.get("tl")).toBeNull();
  });
});

/* ------------------------------ poarta de acces ---------------------------- */

describe("poarta de activare/dezactivare", () => {
  const tl = imobiliarePromotion("tl")!;

  it("blochează activarea când nu există locuri libere", () => {
    const guard = guardImobiliarePromotionChange({
      definition: tl,
      inventory: { slotType: "tl", total: 8, used: 8, available: 0 },
      current: false,
      next: true,
    });
    expect(guard.allowed).toBe(false);
  });

  it("permite DEZACTIVAREA chiar cu sloturile epuizate", () => {
    expect(
      guardImobiliarePromotionChange({
        definition: tl,
        inventory: { slotType: "tl", total: 8, used: 8, available: 0 },
        current: true,
        next: false,
      }).allowed,
    ).toBe(true);
  });

  it("blochează activarea când inventarul nu a putut fi citit", () => {
    expect(
      guardImobiliarePromotionChange({
        definition: tl,
        inventory: null,
        current: false,
        next: true,
      }).allowed,
    ).toBe(false);
  });

  it("serviciile fără contor (imoradar24) nu au limită de sloturi", () => {
    expect(
      guardImobiliarePromotionChange({
        definition: imobiliarePromotion("promote_imoradar")!,
        inventory: null,
        current: false,
        next: true,
      }).allowed,
    ).toBe(true);
  });

  it("Energy: acceptă până la plafon, refuză peste, permite scăderea", () => {
    const energy = imobiliarePromotion("energy")!;
    const inventory = { slotType: "energy", total: 5, used: 3, available: 2 };
    expect(
      guardImobiliarePromotionChange({ definition: energy, inventory, current: 3, next: 5 }).allowed,
    ).toBe(true);
    expect(
      guardImobiliarePromotionChange({ definition: energy, inventory, current: 3, next: 6 }).allowed,
    ).toBe(false);
    expect(
      guardImobiliarePromotionChange({ definition: energy, inventory: null, current: 3, next: 1 })
        .allowed,
    ).toBe(true);
  });

  it("refuză comanda serviciilor fără câmp confirmat", () => {
    expect(
      guardImobiliarePromotionChange({
        definition: imobiliarePromotion("rotatii")!,
        inventory: { slotType: "rotatii", total: 5, used: 0, available: 5 },
        current: false,
        next: true,
      }).allowed,
    ).toBe(false);
  });
});

/* --------------------------------- scriere --------------------------------- */

describe("comanda unui serviciu pe ofertă", () => {
  it("trimite doar câmpul modificat, după revalidarea inventarului", async () => {
    responder = (call) =>
      call.path.startsWith("/api/v3/promotions/slots")
        ? ok({ data: { total: 5, used: 1 } })
        : ok({ data: { promotions: { top_listing: true } } });
    const result = await setImobiliareListingPromotion({
      admin: fakeAdmin,
      session: session(),
      organizationId: "org-1",
      reference: "HB-1006",
      definition: imobiliarePromotion("tl")!,
      value: true,
      current: false,
    });
    expect(result.ok).toBe(true);
    expect(calls[0]?.path).toBe("/api/v3/promotions/slots/tl");
    const write = calls.at(-1);
    expect(write?.method).toBe("POST");
    expect(write?.path).toBe("/api/v3/listings/HB-1006/promotions");
    expect(write?.body).toEqual({ promotions: { top_listing: true } });
    // Scrierea trece prin blocarea durabilă (fără suprapuneri).
    expect(lockCalls[0]?.[0]).toBe("acquire_portal_operation_lock");
  });

  it("dezactivarea nu cere inventar", async () => {
    responder = () => ok({ data: { promotions: { bonus: false } } });
    const result = await setImobiliareListingPromotion({
      admin: fakeAdmin,
      session: session(),
      organizationId: "org-1",
      reference: "HB-1006",
      definition: imobiliarePromotion("bonus")!,
      value: false,
      current: true,
    });
    expect(result.ok).toBe(true);
    expect(calls.every((call) => !call.path.includes("/promotions/slots/"))).toBe(true);
  });

  it("dacă slotul s-a consumat între afișare și apăsare, NU pretinde succes", async () => {
    responder = (call) =>
      call.path.startsWith("/api/v3/promotions/slots")
        ? ok({ data: { total: 1, used: 1 } })
        : ok({ data: {} });
    const result = await setImobiliareListingPromotion({
      admin: fakeAdmin,
      session: session(),
      organizationId: "org-1",
      reference: "HB-1006",
      definition: imobiliarePromotion("tls")!,
      value: true,
      current: false,
    });
    expect(result.ok).toBe(false);
    // Nu s-a trimis nicio scriere către portal.
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("Energy trimite valoare numerică, nu boolean", async () => {
    responder = (call) =>
      call.path.startsWith("/api/v3/promotions/slots")
        ? ok({ data: { total: 5, used: 0 } })
        : ok({ data: { promotions: { energy: 4 } } });
    const result = await setImobiliareListingPromotion({
      admin: fakeAdmin,
      session: session(),
      organizationId: "org-1",
      reference: "HB-1006",
      definition: imobiliarePromotion("energy")!,
      value: 4,
      current: 0,
    });
    expect(result.ok).toBe(true);
    expect(calls.at(-1)?.body).toEqual({ promotions: { energy: 4 } });
  });

  it("reînnoiește tokenul la 401 și reia cererea", async () => {
    let seen = 0;
    responder = (call) => {
      if (call.path.startsWith("/api/v3/promotions/slots")) return ok({ data: { total: 2, used: 0 } });
      seen += 1;
      return seen === 1
        ? { ok: false, status: 401, body: null, classification: { code: "AUTH_ERROR", message: "Token expirat." } }
        : ok({ data: { promotions: { promo: true } } });
    };
    const result = await setImobiliareListingPromotion({
      admin: fakeAdmin,
      session: session(),
      organizationId: "org-1",
      reference: "HB-1006",
      definition: imobiliarePromotion("promo")!,
      value: true,
      current: false,
    });
    expect(result.ok).toBe(true);
    expect(calls.at(-1)?.accessToken).toBe("refreshed-token-secret");
  });

  it("nu scurge tokenul în rezultat sau în mesajele de eroare", async () => {
    responder = (call) =>
      call.path.startsWith("/api/v3/promotions/slots")
        ? ok({ data: { total: 1, used: 0 } })
        : {
            ok: false,
            status: 400,
            body: { errors: { promotions: ["Serviciu indisponibil."] } },
            classification: { code: "INVALID_REQUEST", message: "Portalul a respins cererea." },
          };
    const result = await setImobiliareListingPromotion({
      admin: fakeAdmin,
      session: session(),
      organizationId: "org-1",
      reference: "HB-1006",
      definition: imobiliarePromotion("tl")!,
      value: true,
      current: false,
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("access-token-secret");
    expect(serialized).not.toContain("refreshed-token-secret");
    expect(result.ok).toBe(false);
  });

  it("izolează agențiile: cheia de blocare și de limitare include agenția", async () => {
    responder = () => ok({ data: { promotions: { bonus: false } } });
    await setImobiliareListingPromotion({
      admin: fakeAdmin,
      session: session(),
      organizationId: "org-A",
      reference: "HB-1006",
      definition: imobiliarePromotion("bonus")!,
      value: false,
      current: true,
    });
    expect(JSON.stringify(lockCalls[0])).toContain("org-A");
    expect(JSON.stringify(lockCalls[0])).not.toContain("org-B");
  });
});
