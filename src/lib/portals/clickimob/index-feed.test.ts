import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import {
  handleClickimobIndex,
  selectClickimobAgencies,
  type ClickimobIndexDeps,
  type ClickimobSourceData,
} from "./index-feed.server";
import { clickimobFeedToken, verifyClickimobFeedToken } from "./index-feed";

const KEY = "test-clickimob-key-0123456789";
const NOW = new Date("2026-09-29T09:00:00Z");
const DAY = 24 * 3600 * 1000;
const ORG_A = "04041622-b3d2-4cbe-a200-000000000001";
const ORG_B = "0b0b0b0b-0000-4000-8000-000000000002";

function org(id: string, over: Partial<ClickimobSourceData["orgs"][number]> = {}) {
  return {
    id,
    status: "active",
    archived_at: null,
    name: "Agenția " + id.slice(0, 4),
    legal_name: null,
    cui: null,
    email: "office@x.ro",
    phone: null,
    city: "București",
    logo_url: null,
    material_address: null,
    material_email: "material@x.ro",
    material_phone: "",
    material_website: null,
    updated_at: "2026-09-20T10:00:00Z",
    ...over,
  };
}

function src(over: Partial<ClickimobSourceData> = {}): ClickimobSourceData {
  return {
    orgs: [org(ORG_A)],
    connections: [{ organization_id: ORG_A, activated: true, external_account_id: null, updated_at: null }],
    activeKeyOrgs: [],
    selectedOrgs: [ORG_A],
    states: [],
    ...over,
  };
}

const req = (p: string) => new Request(`https://crm.habitoo.ro${p}`);

function deps(from: ClickimobSourceData, now = NOW): ClickimobIndexDeps {
  return {
    indexKey: () => KEY,
    listAgencies: async () => selectClickimobAgencies(from, now).agencies,
    log: vi.fn(async () => {}),
    rateLimited: () => false,
  };
}

describe("indexul ClickImob", () => {
  it("cheie greșită → 401 fără conținut", async () => {
    const d = deps(src());
    const res = await handleClickimobIndex(req("/x/bad.json"), "bad.json", d, NOW);
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("");
    expect(d.log).toHaveBeenCalledWith(expect.objectContaining({ status: 401, endpoint: "portal.clickimob.index" }));
  });

  it("cheie lipsă din secrete → 401", async () => {
    const d = { ...deps(src()), indexKey: () => undefined };
    const res = await handleClickimobIndex(req("/x/a.json"), "a.json", d, NOW);
    expect(res.status).toBe(401);
  });

  it("agenție activată cu oferte → apare, cu JSON și token semnat", async () => {
    const res = await handleClickimobIndex(req(`/x/${KEY}.json`), `${KEY}.json`, deps(src()), NOW);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-cache, must-revalidate");
    const body = await res.json();
    expect(body.version).toBe("habitoo-clickimob-index/1.0");
    expect(body.agencies).toHaveLength(1);
    const a = body.agencies[0];
    expect(a.id).toMatch(/^hb04041622b3d2/);
    expect(a.email).toBe("material@x.ro");
    expect(a.phone).toBeNull();
    expect(a.county).toBeNull();
    expect(a.status).toBe("active");
    expect(a.inactive_since).toBeNull();
    expect(a.feed.base_url).toBe("https://crm.habitoo.ro/api/public/sites/v1");
    expect(verifyClickimobFeedToken(a.feed.token, KEY)).toBe(a.id);
  });

  it("agenție cu conexiune pe agenție (agency_id sau cheie activă) → nu apare", () => {
    const withAccount = src({
      connections: [{ organization_id: ORG_A, activated: true, external_account_id: "uuid-ci", updated_at: null }],
    });
    expect(selectClickimobAgencies(withAccount, NOW).agencies).toHaveLength(0);
    expect(selectClickimobAgencies(src({ activeKeyOrgs: [ORG_A] }), NOW).agencies).toHaveLength(0);
  });

  it("agenție fără oferte bifate → nu apare", () => {
    expect(selectClickimobAgencies(src({ selectedOrgs: [] }), NOW).agencies).toHaveLength(0);
  });

  it("agenție neactivată sau suspendată → nu apare", () => {
    expect(
      selectClickimobAgencies(
        src({ connections: [{ organization_id: ORG_A, activated: false, external_account_id: null, updated_at: null }] }),
        NOW,
      ).agencies,
    ).toHaveLength(0);
    expect(selectClickimobAgencies(src({ orgs: [org(ORG_A, { status: "suspended" })] }), NOW).agencies).toHaveLength(0);
  });

  it("agenție dezactivată → grace 7 zile, apoi dispare", () => {
    const first = selectClickimobAgencies(src(), NOW);
    const state = first.changes[0]!;
    const deactivatedAt = new Date(NOW.getTime() + DAY);
    const off = src({
      connections: [
        { organization_id: ORG_A, activated: false, external_account_id: null, updated_at: deactivatedAt.toISOString() },
      ],
      states: [state],
    });
    const later = new Date(NOW.getTime() + 3 * DAY);
    const grace = selectClickimobAgencies(off, later);
    expect(grace.agencies[0]?.status).toBe("grace");
    expect(grace.agencies[0]?.inactive_since).toBe(deactivatedAt.toISOString());
    const saved = grace.changes[0]!;
    const gone = selectClickimobAgencies({ ...off, states: [saved] }, new Date(deactivatedAt.getTime() + 8 * DAY));
    expect(gone.agencies).toHaveLength(0);
  });

  it("tokenul se verifică, cel modificat e respins", () => {
    const t = clickimobFeedToken("hbA", KEY);
    expect(t).toMatch(/^hbci_hbA\.[0-9a-f]{64}$/);
    expect(verifyClickimobFeedToken(t, KEY)).toBe("hbA");
    expect(verifyClickimobFeedToken(t.slice(0, -1) + (t.endsWith("0") ? "1" : "0"), KEY)).toBeNull();
    expect(verifyClickimobFeedToken(t.replace("hbA", "hbB"), KEY)).toBeNull();
    expect(verifyClickimobFeedToken(t, "alta-cheie")).toBeNull();
    expect(verifyClickimobFeedToken("hbA", KEY)).toBeNull();
  });

  it("două agenții → ambele listate", () => {
    const two = src({
      orgs: [org(ORG_A), org(ORG_B)],
      connections: [
        { organization_id: ORG_A, activated: true, external_account_id: null, updated_at: null },
        { organization_id: ORG_B, activated: true, external_account_id: null, updated_at: null },
      ],
      selectedOrgs: [ORG_A, ORG_B],
    });
    expect(selectClickimobAgencies(two, NOW).agencies).toHaveLength(2);
  });
});
