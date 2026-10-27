import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createFakeRepository } from "./fake-repository";
import { ingestListings } from "../ingest";
import { normalizeHbsyncMarketListing } from "../hbsync";

const day = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() - offsetDays * day).toISOString();

describe("market_listings lifecycle (nightly)", () => {
  it("marks offers unseen for 14 days inactive and deletes only those older than 365 days", async () => {
    const db = new PGlite();
    await db.exec(`CREATE TABLE market_listings(id text PRIMARY KEY, status text, last_seen_at timestamptz, disappeared_at timestamptz, status_changes int DEFAULT 0, updated_at timestamptz);
      CREATE TABLE market_listing_sources(market_listing_id text, is_active boolean DEFAULT true);
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;`);
    await db.exec(readFileSync("drizzle/migrations/0204_market_listings_retention_12_months.sql", "utf8"));
    const rows: [string, string, number][] = [
      ["fresh", "active", 13], ["stale", "active", 15], ["old-inactive", "inactive", 300], ["day-364", "inactive", 364], ["day-366", "inactive", 366], ["active-400", "active", 400],
    ];
    for (const [id, status, age] of rows) {
      await db.query("INSERT INTO market_listings(id,status,last_seen_at) VALUES($1,$2,$3)", [id, status, iso(age)]);
      await db.query("INSERT INTO market_listing_sources(market_listing_id) VALUES($1)", [id]);
    }
    const r = await db.query<{ result: { inactivated: number; deleted: number } }>("SELECT public.market_listings_lifecycle() AS result");
    expect(r.rows[0]!.result).toEqual({ inactivated: 2, deleted: 2 });
    const left = (await db.query<{ id: string; status: string; disappeared_at: string | null }>("SELECT id,status,disappeared_at FROM market_listings ORDER BY id")).rows;
    expect(left.map((x) => x.id)).toEqual(["day-364", "fresh", "old-inactive", "stale"]);
    const stale = left.find((x) => x.id === "stale")!;
    expect(stale.status).toBe("inactive");
    expect(stale.disappeared_at).not.toBeNull();
    expect(left.find((x) => x.id === "fresh")!.status).toBe("active");
    await db.close();
  });
});

describe("hbsync historical market offers", () => {
  const base = { source: "storia", external_id: "h-1", deal_type: "sale", property_type: "apartment", price: 80000, currency: "EUR", surface_built: 55, rooms: 2, city: "Chiajna", county: "Ilfov" };
  const norm = (extra: Record<string, unknown>) => {
    const r = normalizeHbsyncMarketListing({ ...base, ...extra });
    if (!r.ok) throw new Error(r.message);
    return r.listing;
  };

  it("stores an inactive historical offer once, keeps newer state and reactivates when seen again", async () => {
    const { repo, store } = createFakeRepository();
    const opts = { source: "storia", mode: "partial" as const, runId: null, now: new Date().toISOString() };
    const hist = norm({ status: "inactive", first_seen_at: iso(200), last_seen_at: iso(120), disappeared_at: iso(119) });
    await ingestListings(repo, opts, [hist]);
    await ingestListings(repo, opts, [hist]);
    expect(store.listings).toHaveLength(1);
    expect(store.listings[0]!.status).toBe("inactive");
    expect(store.listings[0]!.disappearedAt?.slice(0, 10)).toBe(iso(119).slice(0, 10));
    // Older observation does not overwrite the stored one.
    await ingestListings(repo, opts, [norm({ status: "active", last_seen_at: iso(150) })]);
    expect(store.listings[0]!.status).toBe("inactive");
    // Seen again today: active, disappeared_at cleared.
    await ingestListings(repo, opts, [norm({ status: "active", last_seen_at: iso(0) })]);
    expect(store.listings).toHaveLength(1);
    expect(store.listings[0]!.status).toBe("active");
    expect(store.listings[0]!.disappearedAt).toBeNull();
  });

  it("rejects offers unseen for more than 12 months", () => {
    const r = normalizeHbsyncMarketListing({ ...base, status: "inactive", last_seen_at: iso(400) });
    expect(r.ok).toBe(false);
  });
});
