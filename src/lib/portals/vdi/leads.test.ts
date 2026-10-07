/** Lead-uri VDI.ro — doar mock-uri, fără rețea și fără bază de date. */
import { describe, expect, it, vi } from "vitest";
import {
  VDI_LEAD_TYPES,
  parseVdiLead,
  parseVdiWebhook,
  processVdiLead,
  readVdiAgencyId,
  signVdiBody,
  verifyVdiSignature,
  type VdiLeadDeps,
} from "./leads";
import { VDI_MAX_PHOTOS } from "./mapper";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
const { pollVdiLeadsForConnection } = await import("./leads.server");

const rawLead = (over: Record<string, unknown> = {}) => ({
  id: "m-16871",
  tip: "cerere_sunat",
  data: "2026-10-07T09:12:40+03:00",
  nume: "Ion Popescu",
  telefon: "0722123456",
  email: null,
  mesaj: "Vă rog să mă contactați.",
  oferta: { pid: 1262725, idintern: "4187", titlu: "Apartament 3 camere", link: "https://vdi.ro/x" },
  agent: { id: 10045, idintern: "262", nume: "Andrei" },
  suma: null,
  moneda: null,
  ...over,
});

function deps(opts: { listing?: boolean; agent?: string | null } = {}) {
  const ingested: Parameters<VdiLeadDeps["ingest"]>[0][] = [];
  const notified: Parameters<VdiLeadDeps["notify"]>[0][] = [];
  const unmatched: string[] = [];
  const d: VdiLeadDeps = {
    findListing: vi.fn(async (org: string, id: string) =>
      opts.listing === false || org !== "org-a" || id !== "4187"
        ? null
        : { propertyId: "p1", assignedTo: "owner", title: "Apartament 3 camere" },
    ),
    findAgent: vi.fn(async (org: string) => (org === "org-a" ? (opts.agent === undefined ? "agent-262" : opts.agent) : null)),
    saveUnmatched: async (l) => void unmatched.push(l.id),
    ingest: async (i) => {
      ingested.push(i);
      return { leadId: "L1", created: true };
    },
    notify: async (n) => void notified.push(n),
  };
  return { d, ingested, notified, unmatched };
}

describe("semnătura webhook-ului VDI.ro", () => {
  const body = JSON.stringify({ eveniment: "lead_nou", agentie_id: 720, lead: rawLead() });
  it("acceptă doar sha256=HMAC hex pe corpul brut, cu secretul agenției", () => {
    const sig = signVdiBody(body, "secret-a");
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifyVdiSignature(body, sig, "secret-a")).toBe(true);
    expect(verifyVdiSignature(body, sig, "secret-b")).toBe(false);
    expect(verifyVdiSignature(body + " ", sig, "secret-a")).toBe(false);
    expect(verifyVdiSignature(body, null, "secret-a")).toBe(false);
    expect(verifyVdiSignature(body, sig, null)).toBe(false);
    expect(verifyVdiSignature(body, "sha256=abc", "secret-a")).toBe(false);
  });
  it("citește agentie_id înainte de verificare", () => {
    expect(readVdiAgencyId(body)).toBe("720");
    expect(readVdiAgencyId("nu e json")).toBeNull();
    expect(parseVdiWebhook(body).lead?.id).toBe("m-16871");
  });
});

describe("lead → anunț și agent", () => {
  it("anunț găsit în agenție: lead cu proprietatea și agentul din idintern", async () => {
    const h = deps();
    const out = await processVdiLead(h.d, "org-a", parseVdiLead(rawLead()), "e1");
    expect(out).toEqual({ status: "lead", leadId: "L1", created: true });
    expect(h.ingested[0]).toMatchObject({ organizationId: "org-a", propertyId: "p1", assignedTo: "agent-262" });
    expect(h.notified[0]!.assignedTo).toBe("agent-262");
  });
  it("fără agent mapat → agentul proprietății", async () => {
    const h = deps({ agent: null });
    await processVdiLead(h.d, "org-a", parseVdiLead(rawLead()), "e1");
    expect(h.ingested[0]!.assignedTo).toBe("owner");
  });
  it("anunț negăsit → nepotrivit, fără lead și fără altă agenție", async () => {
    const h = deps({ listing: false });
    expect(await processVdiLead(h.d, "org-a", parseVdiLead(rawLead()), "e1")).toEqual({ status: "unmatched" });
    expect(h.unmatched).toEqual(["m-16871"]);
    expect(h.ingested).toHaveLength(0);
  });
  it("căutarea anunțului rămâne în agenția verificată", async () => {
    const h = deps();
    expect((await processVdiLead(h.d, "org-b", parseVdiLead(rawLead()), "e1")).status).toBe("unmatched");
    expect(h.d.findListing).toHaveBeenCalledWith("org-b", "4187");
  });
  it("formular agenție (fără ofertă) → lead fără proprietate", async () => {
    const h = deps();
    await processVdiLead(h.d, "org-a", parseVdiLead(rawLead({ tip: "contact_agentie", oferta: null, agent: null })), "e1");
    expect(h.ingested[0]).toMatchObject({ propertyId: null, assignedTo: null });
  });
  it("lead invalid (fără id) e ignorat", async () => {
    const h = deps();
    expect(await processVdiLead(h.d, "org-a", parseVdiLead({ tip: "mesaj" }), null)).toEqual({ status: "invalid" });
  });
});

describe("fiecare tip de lead creează lead cu eticheta în română", () => {
  const expected: Record<string, string> = {
    mesaj: "Mesaj",
    email: "Email",
    cerere_sunat: "Cerere de apel",
    oferta_pret: "Ofertă de preț",
    licitatie: "Înscriere la licitație",
    chatbot: "Chatbot",
    site_agentie: "Site agenție",
    manual: "Lead manual",
    contact_agentie: "Contact agenție",
  };
  it("are exact cele 9 tipuri", () => {
    expect(Object.keys(VDI_LEAD_TYPES).sort()).toEqual(Object.keys(expected).sort());
  });
  for (const [tip, label] of Object.entries(expected)) {
    it(tip, async () => {
      const h = deps();
      const out = await processVdiLead(h.d, "org-a", parseVdiLead(rawLead({ tip, id: `m-${tip}` })), "e1");
      expect(out.status).toBe("lead");
      expect(h.ingested[0]!.lead.typeLabel).toBe(label);
      expect(h.notified).toHaveLength(1);
    });
  }
  it("oferta_pret păstrează suma și moneda", () => {
    const l = parseVdiLead(rawLead({ tip: "oferta_pret", suma: 120000, moneda: "EUR" }))!;
    expect(l.amount).toBe(120000);
    expect(l.currency).toBe("EUR");
  });
});

describe("tragerea de rezervă GET /apileaduri", () => {
  function pollDeps(pages: unknown[], seen = new Set<string>()) {
    const processed: string[] = [];
    const cursors: (string | null)[] = [];
    let pollAfter: string | null = null;
    const fetchPage = vi.fn(async () => {
      const p = pages.shift();
      return p as never;
    });
    return {
      processed,
      cursors,
      get pollAfter() {
        return pollAfter;
      },
      fetchPage,
      deps: {
        fetchPage,
        record: async (_o: string, _r: unknown, id: string) => {
          const dup = seen.has(id);
          seen.add(id);
          return { eventId: `e-${id}`, duplicate: dup, processed: dup };
        },
        process: async (eventId: string) => void processed.push(eventId),
        saveCursor: async (c: string | null, after: string | null) => {
          cursors.push(c);
          pollAfter = after;
        },
      },
    };
  }

  it("dedupe pe lead.id între webhook și tragere; cursor salvat; pagini până la mai_sunt=false", async () => {
    const seen = new Set(["m-1"]); // deja venit prin webhook
    const h = pollDeps(
      [
        { ok: true, page: { leads: [rawLead({ id: "m-1" }), rawLead({ id: "m-2" })], nextCursor: "c1", more: true } },
        { ok: true, page: { leads: [rawLead({ id: "m-2" }), rawLead({ id: "f-3", oferta: null })], nextCursor: "c2", more: false } },
      ],
      seen,
    );
    const out = await pollVdiLeadsForConnection(h.deps, { organizationId: "org-a", apiKey: "k", cursor: null });
    expect(out.recorded).toBe(2);
    expect(h.processed).toEqual(["e-m-2", "e-f-3"]);
    expect(h.cursors).toEqual(["c1", "c2"]);
    expect(h.fetchPage).toHaveBeenCalledTimes(2);
  });

  it("429 cu Retry-After → pauză, cursor păstrat, fără eroare finală", async () => {
    const h = pollDeps([{ ok: false, rateLimited: true, retryAfterMs: 30_000, error: "429" }]);
    const out = await pollVdiLeadsForConnection(h.deps, { organizationId: "org-a", apiKey: "k", cursor: "c0" });
    expect(out).toEqual({ recorded: 0, rateLimited: true, error: null });
    expect(h.cursors).toEqual(["c0"]);
    expect(h.pollAfter).not.toBeNull();
  });
});

describe("limitele contului de probă", () => {
  it("maximum 20 de poze pe anunț", () => {
    expect(VDI_MAX_PHOTOS).toBe(20);
  });
});
