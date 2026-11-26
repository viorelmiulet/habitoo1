import { properstarEntityId } from "@/lib/portals/properstar/mapper";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { allPortals, getPortalDefinition, portalActivationMode } from "@/lib/portals/registry";
import { dynamicPortalDefinition, type DynamicFeedPortal } from "@/lib/dynamic-feed-portals";
import { withFeedDefinitions } from "@/lib/feed-registry-scope.server";
import { resolveIndexPortal } from "@/lib/dynamic-feed-portals.server";
import { sortPromotionPortals } from "@/lib/promotion-portal-order";
import { integrationPageBySlug, INTEGRATION_PAGES } from "@/lib/portals/integration-pages";
import { KEY_REQUEST_PORTALS, notifyKeyRequestForRequest, type NotifyDeps } from "@/lib/portals/imospot-key-request";
import { handlePortalIndex, listPortalIndexedAgencies } from "@/lib/portals/clickimob/index-feed.server";
import { authorizeIndexKey, hashIndexKey } from "./index-keys.server";
import { authenticateFeedRequest } from "./auth.server";
import { handlePropertiesList } from "./handlers.server";
import { selectedPropertyIdsForPortal } from "./selection.server";
import { mapPropertyToFeed, type PropertyRow } from "./mapper";

const org = "11111111-1111-4111-8111-111111111111";
const agent = "22222222-2222-4222-8222-222222222222";
const propertyId = "33333333-3333-4333-8333-333333333333";
// Fictitious index credential; not a portal API credential.
const indexKey = "hbth_mva-fixture-index-credential";
const now = new Date("2026-11-26T20:26:00Z");
const dynamic: DynamicFeedPortal = {
  slug: "mvaimobiliare", display_name: "mvaimobiliare.ro", key_prefix: "hbth_",
  website: "https://www.mvaimobiliare.ro", logo_path: "mvaimobiliare/fixture.png",
  xml_enabled: false, active: true, show_public: true, integration_mode: "feed",
};
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
function query(table: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let bounds: [number, number] | null = null;
  const rows = () => (db[table] ?? []).filter(row => filters.every(filter => filter(row)));
  const result = () => ({ data: bounds ? rows().slice(bounds[0], bounds[1] + 1) : rows(), count: rows().length, error: null });
  const q = {
    select: () => q, order: () => q, limit: () => q,
    eq: (col: string, value: unknown) => { filters.push(row => row[col] === value); return q; },
    in: (col: string, value: unknown[]) => { filters.push(row => value.includes(row[col])); return q; },
    is: (col: string, value: unknown) => { filters.push(row => (row[col] ?? null) === value); return q; },
    range: (from: number, to: number) => { bounds = [from, to]; return q; },
    upsert: (rows: Row[]) => { db[table] = rows; return q; },
    update: () => q,
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return q;
}
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (table: string) => query(table), rpc: async () => ({ error: null }) } }));
beforeEach(() => {
  for (const key of Object.keys(db)) delete db[key];
  db["dynamic_feed_portals"] = [dynamic as unknown as Row];
  db["organizations"] = [{ id: org, name: "Agenție fictivă", status: "active", archived_at: null, updated_at: now.toISOString() }];
  db["portal_connections"] = [{ organization_id: org, portal: "mvaimobiliare", activated: true, updated_at: now.toISOString(), credentials_encrypted: null }];
  db["portal_publications"] = [{ organization_id: org, portal_key: "mvaimobiliare", enabled: true, property_id: propertyId }];
  db["portal_index_keys"] = [{ id: "fixture-key", portal: "mvaimobiliare", key_type: "index", source: "managed", status: "active", key_hash: hashIndexKey(indexKey) }];
  db["profiles"] = [{ id: agent, organization_id: org, full_name: "Agent fictiv", phone: "0700000000" }];
  db["properties"] = [
    { id: propertyId, organization_id: org, assigned_to: agent, reference: "HB-1", title: "Apartament fictiv", publish_status: "published", status: "active", deleted_at: null, transaction: "sale", updated_at: now.toISOString() },
    { id: "44444444-4444-4444-8444-444444444444", organization_id: org, title: "Neselectat", publish_status: "published", status: "active" },
  ];
});

describe("activare MVA fără întreruperea feedului", () => {
  it("registrul dă o singură definiție statică, cu cheia API și capabilitățile cerute", () => {
    withFeedDefinitions([dynamicPortalDefinition(dynamic)], () => {
      const portal = getPortalDefinition("mvaimobiliare");
      expect(allPortals().filter(p => p.id === "mvaimobiliare")).toEqual([portal]);
      expect(portal).toMatchObject({ display_name: "mvaimobiliare.ro", authentication: ["portal_api_key"], receives_leads: true, logo_url: "/api/public/feed/mvaimobiliare/logo" });
      expect(portal?.dynamic_feed).not.toBe(true);
      expect(portal?.capabilities).toEqual(["test_connection", "publish_listing", "update_listing", "withdraw_listing"]);
      expect(portal?.configuration_schema.fields).toEqual([{ key: "api_key", label: "Cheie API mvaimobiliare.ro", secret: true, target: "credentials" }]);
      expect(portalActivationMode("mvaimobiliare")).toBe("approval");
    });
  });

  it("cererea trimite o singură dată emailul portalului, cu ID-ul și toate datele firmei", async () => {
    let notifiedAt: string | null = null;
    const send = vi.fn(async (_email: Parameters<NotifyDeps["send"]>[0]) => ({ ok: true }));
    const deps: NotifyDeps = {
      loadRequest: async () => ({ id: "request", organizationId: org, portal: "mvaimobiliare", status: "approved", notifyRequired: true, notifiedAt }),
      loadCompany: async () => ({ agencyName: "Agenție fictivă", legalName: "Firmă fictivă SRL", cui: "RO123456", tradeRegistryNumber: "J40/1/2020", adminName: "Ana Test", adminEmail: "ana@example.org", adminPhone: "0700000000", city: "București" }),
      loadSettings: async portal => KEY_REQUEST_PORTALS[portal].defaults,
      send, save: async (_id, patch) => { notifiedAt = patch.notifiedAt ?? notifiedAt; }, audit: async () => {},
    };
    expect(await notifyKeyRequestForRequest(deps, "request")).toEqual({ status: "sent" });
    expect(await notifyKeyRequestForRequest(deps, "request")).toEqual({ status: "skipped", reason: "already_sent" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "contact@mvaimobiliare.ro", from: "Habitoo CRM <contact@habitoo.ro>", cc: "contact@habitoo.ro", replyTo: "ana@example.org" }));
    const email = send.mock.calls[0]?.[0] as Parameters<NotifyDeps["send"]>[0] | undefined;
    expect(email?.text).toContain(`ID agenție Habitoo: ${properstarEntityId("hb", org)}`);
    for (const value of [properstarEntityId("hb", org), "Agenție fictivă", "Firmă fictivă SRL", "RO123456", "J40/1/2020", "Ana Test", "ana@example.org", "0700000000", "București"]) {
      expect(email?.text).toContain(value);
      expect(email?.html).toContain(value);
    }
  });

  it("indexul păstrează identitatea feedului și agenția activată fără cheie API", async () => {
    expect(await resolveIndexPortal("mvaimobiliare")).toEqual({ prefix: "hbth_", secret: null, version: "habitoo-mvaimobiliare-index/1.0", active: true });
    const response = await handlePortalIndex(new Request("http://localhost:8080/api/public/feed/mvaimobiliare/index/fixture"), indexKey, "mvaimobiliare", {
      indexKey: () => undefined, authorize: authorizeIndexKey, listAgencies: date => listPortalIndexedAgencies(date, "mvaimobiliare"), log: async () => {}, rateLimited: () => false,
    }, now);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.version).toBe("habitoo-mvaimobiliare-index/1.0");
    expect(body.agencies).toHaveLength(1);
    expect(body.agencies[0]).toMatchObject({ name: "Agenție fictivă", status: "active", feed: { base_url: "http://localhost:8080/api/public/sites/v1" } });
    const request = new Request("http://localhost:8080/api/public/sites/v1/properties", { headers: { authorization: `Bearer ${body.agencies[0].feed.token}` } });
    const auth = await authenticateFeedRequest(request);
    expect(auth.ok).toBe(true);
    if (!auth.ok) throw new Error("Tokenul existent trebuie acceptat");
    expect(auth.portal).toBe("mvaimobiliare");
    const feed = await handlePropertiesList(request, auth);
    expect(feed.response.status).toBe(200);
    const data = await feed.response.json();
    const property = db["properties"]?.[0];
    if (!property) throw new Error("Lipsește proprietatea de test");
    expect(data.data).toEqual(JSON.parse(JSON.stringify([mapPropertyToFeed(property as PropertyRow, { baseUrl: "http://localhost:8080", publicSiteUrl: "http://localhost:8080", images: [], agent: { id: agent, full_name: "Agent fictiv" }, portalKeys: ["mvaimobiliare"] })])));
    expect(db["portal_connections"]?.[0]?.["activated"]).toBe(true);
    expect(db["dynamic_feed_portals"]).toEqual([dynamic]);
  });

  it("feedul păstrează și filtrarea existentă a agentului fără telefon", async () => {
    db["profiles"] = [{ id: agent, organization_id: org, phone: null }];
    expect(await selectedPropertyIdsForPortal(org, "mvaimobiliare")).toEqual([]);
  });

  it("pagina publică rămâne disponibilă o singură dată, cu definiția statică", () => {
    expect(INTEGRATION_PAGES.filter(p => p.slug === "mvaimobiliare")).toHaveLength(1);
    expect(integrationPageBySlug("mvaimobiliare")?.definition).toBe(getPortalDefinition("mvaimobiliare"));
  });

  it("Imobiliare.ro rămâne ultimul, inclusiv când definiția dinamică MVA este încă încărcată", () => {
    withFeedDefinitions([dynamicPortalDefinition(dynamic)], () => {
      const portals = sortPromotionPortals(allPortals(), portal => portal.id);
      expect(portals.at(-1)?.id).toBe("imobiliare_ro");
      expect(portals.filter(p => p.id === "mvaimobiliare")).toHaveLength(1);
    });
  });
});