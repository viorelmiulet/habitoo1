import { describe, it, expect, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { syncPortalOrganization, type SyncDeps } from "@/lib/partner-api/sync.server";
import { handleAgencies, handleAgents, handleChanges, handleListing, handleListings, type PartnerReadStore, type StoredEvent, type StoredListing } from "@/lib/partner-api/read.server";
import { mapPartnerListing, mapPartnerAgent, type ListingStateRow, type PartnerAgent } from "@/lib/partner-api/schema";
import type { PartnerContext, Environment } from "@/lib/partner-api/core.server";
import type { PropertyRow } from "@/lib/site-feed/mapper";

const PORTAL = "exempluimob";
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG_A = uid(1), ORG_B = uid(2), ORG_TEST = uid(3), AGENT = uid(50);

function property(n: number, org: string, extra: Partial<PropertyRow> = {}): PropertyRow {
  return {
    id: uid(100 + n), organization_id: org, reference: `HB-${1000 + n}`, title: `Apartament ${n}`, description: "Descriere",
    property_type: "apartment", category: null, status: "active", publish_status: "published", deleted_at: null,
    transaction_kind: "sale", for_sale: true, for_rent: false, sale_price: 100000 + n, sale_currency: "EUR", rent_price: null, rent_currency: null,
    price: 100000 + n, currency: "EUR", vat_included: true, negotiable: false, assigned_to: AGENT,
    lat: 44.43, lng: 26.1, location_precise: true, street: "Strada Exemplu", street_number: "7", city: "București", county: "București", district: "Floreasca",
    internal_notes: "NOTA-INTERNA-SECRETA", commission: "COMISION-INTERN-3%", owner_contact_id: uid(999), collab_terms: "TERMENI-INTERNI",
    tags: [], features: ["Balcon"], utilities: [], created_at: "2026-10-01T00:00:00.000Z", updated_at: "2026-10-01T00:00:00.000Z",
    ...extra,
  } as unknown as PropertyRow;
}

class World {
  clock = 0; seq = 0;
  active = new Set<string>(); selected = new Map<string, Set<string>>(); props = new Map<string, PropertyRow>();
  testAgencies = new Set<string>([ORG_TEST]);
  listingState = new Map<string, StoredListing & { agent_id: string | null; content_hash: string }>();
  agencyState = new Map<string, { active: boolean; activated_at: string | null }>();
  agentState = new Map<string, { organization_id: string; content_hash: string; payload: PartnerAgent }>();
  events: StoredEvent[] = [];
  now() { return new Date(Date.UTC(2026, 10, 7, 12, 0, 0, this.clock++)).toISOString(); }
  addProperty(p: PropertyRow, selected = true) {
    this.props.set(p.id, p);
    if (!this.selected.has(p.organization_id)) this.selected.set(p.organization_id, new Set());
    if (selected) this.selected.get(p.organization_id)!.add(p.id);
  }
  event(type: string, entity_type: string, entity_id: string, organization_id: string, at: string) {
    this.events.push({ seq: ++this.seq, type, entity_type, entity_id, organization_id, occurred_at: at });
  }
  deps(): SyncDeps {
    return {
      agencyActive: async (_p, org) => this.active.has(org),
      eligibleListings: async (_p, org) => [...(this.selected.get(org) ?? [])].map(id => this.props.get(id)!)
        .filter(p => p.status === "active" && !p.deleted_at).map(p => mapPartnerListing(p, [])),
      activeAgents: async org => [mapPartnerAgent({ id: org === ORG_A ? AGENT : uid(60), organization_id: org, full_name: "Agent Exemplu", email: "agent@exemplu.ro", phone: "0700000000", avatar_url: null, job_title: "Agent" })],
      agencyState: async (_p, org) => this.agencyState.get(org) ?? null,
      listingState: async (_p, org) => [...this.listingState.values()].filter(r => r.organization_id === org) as unknown as ListingStateRow[],
      agentState: async (_p, org) => [...this.agentState.entries()].filter(([, v]) => v.organization_id === org).map(([agent_id, v]) => ({ agent_id, organization_id: v.organization_id, content_hash: v.content_hash })),
      apply: async (_p, batch) => {
        const at = this.now();
        for (const a of batch.agencies.filter(a => a.active)) { this.agencyState.set(a.organization_id, { active: true, activated_at: at }); this.event("agency.activated", "agency", a.organization_id, a.organization_id, at); }
        for (const l of batch.listings) {
          const old = this.listingState.get(l.property_id);
          if (!l.visible && !old?.visible) continue;
          this.listingState.set(l.property_id, { property_id: l.property_id, organization_id: l.organization_id, agent_id: l.agent_id, content_hash: l.content_hash, visible: l.visible, payload: l.payload, updated_at: at, withdrawn_at: l.visible ? null : at });
          this.event(l.visible ? "listing.upserted" : "listing.withdrawn", "listing", l.property_id, l.organization_id, at);
        }
        for (const g of batch.agents) {
          if (g.deleted) this.agentState.delete(g.agent_id); else this.agentState.set(g.agent_id, { organization_id: g.organization_id, content_hash: g.content_hash!, payload: g.payload! });
          this.event("agent.updated", "agent", g.agent_id, g.organization_id, at);
        }
        for (const a of batch.agencies.filter(a => !a.active)) { const s = this.agencyState.get(a.organization_id); if (s) { s.active = false; this.event("agency.deactivated", "agency", a.organization_id, a.organization_id, at); } }
      },
    };
  }
  async sync(...orgs: string[]) { for (const o of orgs) await syncPortalOrganization(PORTAL, o, this.deps(), hash); }
  store(): PartnerReadStore {
    return {
      scope: async (_p, env) => {
        const rows = [...this.agencyState.entries()].filter(([org]) => (env === "test") === this.testAgencies.has(org));
        return { known: rows.map(([o]) => o), active: new Map(rows.filter(([, s]) => s.active).map(([o, s]) => [o, s.activated_at])) };
      },
      organizations: async ids => ids.map(id => ({ id, name: `Agenția ${id.slice(-2)}`, legal_name: null, cui: null, email: null, phone: null, material_website: null, logo_path: null, logo_url: null, registered_address: null, city: null, county: null })),
      listings: async (_p, q) => [...this.listingState.values()]
        .filter(r => q.orgIds.includes(r.organization_id) && (q.status === "all" || r.visible === (q.status === "active")))
        .filter(r => !q.updatedSince || r.updated_at > q.updatedSince)
        .filter(r => !q.after || r.updated_at > q.after.u || (r.updated_at === q.after.u && r.property_id > q.after.i))
        .sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.property_id.localeCompare(b.property_id)).slice(0, q.limit),
      listing: async (_p, id) => this.listingState.get(id) ?? null,
      agents: async (_p, orgIds) => [...this.agentState.values()].filter(a => orgIds.includes(a.organization_id)).map(a => a.payload),
      events: async (_p, orgIds, after, limit) => this.events.filter(e => e.seq > after && orgIds.includes(e.organization_id)).slice(0, limit),
      maxSeq: async () => this.seq,
    };
  }
}
const ctx = (environment: Environment = "live"): PartnerContext => ({
  identity: { id: uid(900), portal: PORTAL, prefix: `hbpk_${environment}_`, environment, key_hash: "a".repeat(64), status: "active" },
  portal: { slug: PORTAL, display_name: "ExempluImob.ro", active: true, integration_mode: "api", rate_limit_per_minute: 120 }, requestId: "req",
});
const body = async (r: Response) => ({ status: r.status, json: await r.json() });
const url = (path: string) => new URL(`https://crm.habitoo.ro/api/public/partner/v1${path}`);

let w: World;
beforeEach(() => { w = new World(); });

describe("Partner API v1 — citirea datelor", () => {
  it("agenția neactivată lipsește din /agencies și /listings", async () => {
    w.active.add(ORG_A); w.addProperty(property(1, ORG_A)); w.addProperty(property(2, ORG_B));
    await w.sync(ORG_A, ORG_B);
    const agencies = await body(await handleAgencies(ctx(), w.store()));
    expect(agencies.json.data.map((a: { id: string }) => a.id)).toEqual([ORG_A]);
    const listings = await body(await handleListings(ctx(), w.store(), url("/listings")));
    expect(listings.json.data.map((l: { agency_id: string }) => l.agency_id)).toEqual([ORG_A]);
    expect((await handleListing(ctx(), w.store(), uid(102))).status).toBe(404);
    expect((await handleListings(ctx(), w.store(), url(`/listings?agency_id=${ORG_B}`))).status).toBe(200);
    expect((await body(await handleListings(ctx(), w.store(), url(`/listings?agency_id=${ORG_B}`)))).json.data).toEqual([]);
  });

  it("anunțul deselectat produce listing.withdrawn și rămâne cu status withdrawn", async () => {
    w.active.add(ORG_A); const p = property(1, ORG_A); w.addProperty(p); await w.sync(ORG_A);
    w.selected.get(ORG_A)!.delete(p.id); await w.sync(ORG_A);
    expect(w.events.filter(e => e.entity_id === p.id).map(e => e.type)).toEqual(["listing.upserted", "listing.withdrawn"]);
    const all = await body(await handleListings(ctx(), w.store(), url("/listings?status=withdrawn")));
    expect(all.json.data).toHaveLength(1);
    expect(all.json.data[0]).toMatchObject({ id: p.id, status: "withdrawn", reference: "HB-1001" });
    expect(all.json.data[0].withdrawn_at).toBeTruthy();
    expect((await body(await handleListings(ctx(), w.store(), url("/listings?status=active")))).json.data).toEqual([]);
    await w.sync(ORG_A); // no duplicate withdrawal
    expect(w.events.filter(e => e.type === "listing.withdrawn")).toHaveLength(1);
    // deactivating the agency withdraws the rest and emits agency.deactivated
    w.addProperty(property(2, ORG_A)); await w.sync(ORG_A); w.active.delete(ORG_A); await w.sync(ORG_A);
    expect(w.events.slice(-2).map(e => e.type)).toEqual(["listing.withdrawn", "agency.deactivated"]);
    expect((await body(await handleAgencies(ctx(), w.store()))).json.data).toEqual([]);
  });

  it("paginarea cu cursor nu sare și nu dublează elemente", async () => {
    w.active.add(ORG_A); for (let i = 1; i <= 7; i++) w.addProperty(property(i, ORG_A)); await w.sync(ORG_A); // same updated_at for all
    w.props.set(uid(103), property(3, ORG_A, { title: "Modificat" })); await w.sync(ORG_A);
    const seen: string[] = []; let cursor: string | null = null; let pages = 0;
    do {
      const r = await body(await handleListings(ctx(), w.store(), url(`/listings?limit=3${cursor ? `&cursor=${cursor}` : ""}`)));
      expect(r.status).toBe(200); seen.push(...r.json.data.map((l: { id: string }) => l.id)); cursor = r.json.next_cursor; pages++;
    } while (cursor && pages < 10);
    expect(seen).toHaveLength(7); expect(new Set(seen).size).toBe(7); expect(seen[6]).toBe(uid(103));
    const bad = await handleListings(ctx(), w.store(), url("/listings?limit=3&status=active&cursor=" + "x".repeat(10)));
    expect(bad.status).toBe(400);
    expect((await handleListings(ctx(), w.store(), url("/listings?limit=101"))).status).toBe(400);
  });

  it("/changes întoarce evenimentele în ordine și reia de la cursor", async () => {
    const start = await body(await handleChanges(ctx(), w.store(), url("/changes")));
    expect(start.json).toMatchObject({ data: [], has_more: false }); expect(start.json.next_cursor).toBeTruthy();
    w.active.add(ORG_A); w.addProperty(property(1, ORG_A)); w.addProperty(property(2, ORG_A)); await w.sync(ORG_A);
    const first = await body(await handleChanges(ctx(), w.store(), url(`/changes?limit=2&cursor=${start.json.next_cursor}`)));
    expect(first.json.data.map((e: { type: string }) => e.type)).toEqual(["agency.activated", "listing.upserted"]);
    expect(first.json.has_more).toBe(true);
    const rest = await body(await handleChanges(ctx(), w.store(), url(`/changes?limit=500&cursor=${first.json.next_cursor}`)));
    expect(rest.json.data.map((e: { type: string }) => e.type)).toEqual(["listing.upserted", "agent.updated"]);
    expect(rest.json.has_more).toBe(false);
    const seqs = [...first.json.data, ...rest.json.data].map((e: { seq: number }) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    const again = await body(await handleChanges(ctx(), w.store(), url(`/changes?cursor=${rest.json.next_cursor}`)));
    expect(again.json.data).toEqual([]);
  });

  it("locația neprecisă nu expune strada sau numărul", async () => {
    w.active.add(ORG_A); w.addProperty(property(1, ORG_A, { location_precise: false })); await w.sync(ORG_A);
    const r = await body(await handleListing(ctx(), w.store(), uid(101)));
    expect(r.json.location).toMatchObject({ street: null, street_number: null, is_precise: false, city: "București" });
    expect(r.json.location.latitude).not.toBe(44.43);
    expect(JSON.stringify(r.json)).not.toContain("Strada Exemplu");
  });

  it("cheia de test nu vede date live", async () => {
    w.active.add(ORG_A); w.addProperty(property(1, ORG_A)); await w.sync(ORG_A);
    expect((await body(await handleAgencies(ctx("test"), w.store()))).json.data).toEqual([]);
    expect((await body(await handleListings(ctx("test"), w.store(), url("/listings")))).json.data).toEqual([]);
    expect((await handleListing(ctx("test"), w.store(), uid(101))).status).toBe(404);
    expect((await body(await handleAgents(ctx("test"), w.store(), url("/agents")))).json.data).toEqual([]);
    const live = await body(await handleChanges(ctx(), w.store(), url("/changes")));
    const fromZero = "eyJzIjowfQ"; // {"s":0}
    expect((await body(await handleChanges(ctx("test"), w.store(), url(`/changes?cursor=${fromZero}`)))).json.data).toEqual([]);
    expect(live.status).toBe(200);
  });

  it("câmpurile interne lipsesc din răspuns", async () => {
    w.active.add(ORG_A); w.addProperty(property(1, ORG_A)); await w.sync(ORG_A);
    const text = JSON.stringify((await body(await handleListings(ctx(), w.store(), url("/listings")))).json)
      + JSON.stringify((await body(await handleAgents(ctx(), w.store(), url("/agents")))).json);
    for (const leaked of ["NOTA-INTERNA-SECRETA", "COMISION-INTERN", "TERMENI-INTERNI", uid(999), "internal_notes", "commission", "owner_contact", "collab"]) expect(text).not.toContain(leaked);
    const listing = (await body(await handleListing(ctx(), w.store(), uid(101)))).json;
    expect(listing.offers).toEqual([{ type: "sale", price: 100001, currency: "EUR", vat_included: true, negotiable: false }]);
    expect(listing.features).toEqual(["balcon"]);
  });
});
