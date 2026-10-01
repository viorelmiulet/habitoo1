/**
 * Raportul „De completat pentru Properstar" (getProperstarFeedReport) construiește
 * `requestUrl` din prefixul fix al feedului, nu din registry: Properstar nu mai are
 * cale publică pe cheie de agenție (model retras), deci `portalPublicFeedUrl`
 * întoarce `null` și vechiul cod cădea cu „Cannot read properties of null".
 *
 * Testăm aceeași construcție (`CRM_URL + PROPERSTAR_FEED_PATH_PREFIX`) prin
 * buildProperstarFeed, cu aceeași bază de date falsă ca în properstar-feed.test.ts.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { CRM_URL } from "@/lib/host";

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {
  portal_connections: [],
  site_feed_access_logs: [],
  portal_publications: [],
  properties: [],
  organizations: [],
  property_images: [],
  profiles: [],
};

function matches(row: Row, filters: { op: string; col: string; value: unknown }[]): boolean {
  return filters.every((f) => {
    const actual = row[f.col];
    if (f.op === "eq") return actual === f.value;
    if (f.op === "neq") return actual !== f.value;
    if (f.op === "is") return (actual ?? null) === f.value;
    if (f.op === "in") return (f.value as unknown[]).includes(actual);
    return true;
  });
}

function builder(table: string) {
  const filters: { op: string; col: string; value: unknown }[] = [];
  const result = () => ({ data: db[table]!.filter((r) => matches(r, filters)), error: null });
  const api: Record<string, unknown> = {
    select: () => api,
    eq: (col: string, value: unknown) => (filters.push({ op: "eq", col, value }), api),
    neq: (col: string, value: unknown) => (filters.push({ op: "neq", col, value }), api),
    is: (col: string, value: unknown) => (filters.push({ op: "is", col, value }), api),
    in: (col: string, value: unknown) => (filters.push({ op: "in", col, value }), api),
    order: () => api,
    limit: () => api,
    maybeSingle: async () => ({ data: result().data[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return api;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (table: string) => builder(table) },
}));

const { buildProperstarFeed, PROPERSTAR_FEED_PATH_PREFIX } = await import("./feed.server");
const { portalPublicFeedUrl } = await import("@/lib/portals/registry");

const ORG = "org-1";

function seedProperty(overrides: Row = {}): Row {
  return {
    id: "prop-1",
    organization_id: ORG,
    reference: "HB-1001",
    title: "Apartament 2 camere",
    description: "Apartament luminos și renovat",
    transaction_kind: "sale",
    property_type: "apartment",
    status: "active",
    publish_status: "published",
    deleted_at: null,
    price: 85000,
    currency: "EUR",
    surface: 60,
    rooms: 2,
    bathrooms: 1,
    floor: 2,
    updated_at: "2026-10-01T10:00:00Z",
    ...overrides,
  };
}

describe("raportul Properstar fără cale pe cheie de agenție", () => {
  beforeEach(() => {
    for (const t of Object.keys(db)) db[t] = [];
    db.organizations = [
      {
        id: ORG,
        name: "Agenția Test",
        email: "contact@agentie.ro",
        phone: "0740123456",
        city: "București",
        postal_code: "010101",
      },
    ];
  });

  it("requestUrl-ul raportului nu conține nicio cheie", () => {
    // Exact construcția din getProperstarFeedReport:
    const requestUrl = `${CRM_URL}${PROPERSTAR_FEED_PATH_PREFIX}`;
    expect(requestUrl).toBe(`${CRM_URL}/api/public/feed/properstar`);
    expect(requestUrl).not.toContain("key");
  });

  it("Properstar nu are cale publică pe cheie în registry (model retras)", () => {
    expect(portalPublicFeedUrl("properstar", "orice-cheie")).toBeNull();
  });

  it("raportul construiește feedul pe prefixul fix: selected, active și excluded", async () => {
    db.portal_publications = [
      { property_id: "prop-1", organization_id: ORG, portal_key: "properstar", enabled: true },
      { property_id: "prop-2", organization_id: ORG, portal_key: "properstar", enabled: true },
    ];
    db.properties = [
      seedProperty(),
      // incompletă: fără preț → exclusă din feed, prezentă în raport
      seedProperty({ id: "prop-2", reference: "HB-1002", price: null }),
    ];

    const build = await buildProperstarFeed({
      organizationId: ORG,
      requestUrl: `${CRM_URL}${PROPERSTAR_FEED_PATH_PREFIX}`,
      useCache: false,
    });

    expect(build.selected).toBe(2);
    expect(build.active).toBe(1);
    expect(build.excluded).toHaveLength(1);
    expect(build.excluded[0]?.propertyId).toBe("prop-2");
  });
});
