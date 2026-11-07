import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { handleVisitsPost } from "./visits.server";
import type { FeedAuthOk } from "./auth.server";
import type { SupabaseClient } from "@supabase/supabase-js";

const ORG = "11111111-1111-4111-8111-111111111111";
const PROPERTY = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
let pg: PGlite;
const auth = (portal = "bazaruldecase") => ({organizationId: ORG, portal, tokenId: "token-one", scopes: ["leads:write"]}) as FeedAuthOk;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE organizations(id uuid PRIMARY KEY);
    CREATE TABLE properties(id uuid PRIMARY KEY, organization_id uuid);
    CREATE TABLE site_feed_visits(organization_id uuid, property_id uuid, views integer, source text, occurred_on date, updated_at timestamptz);
    CREATE UNIQUE INDEX site_feed_visits_unique ON site_feed_visits(organization_id,property_id,occurred_on,coalesce(source,''));
    INSERT INTO organizations VALUES ('${ORG}'); INSERT INTO properties VALUES ('${PROPERTY}','${ORG}'),('${OTHER}','33333333-3333-4333-8333-333333333333');`);
  await pg.exec(readFileSync("supabase/migrations/20260906054505_02aecb96-c710-4b75-b18d-51e2fc8088cc.sql", "utf8"));
  await pg.exec(readFileSync("drizzle/migrations/0245_site_feed_visit_event_receipts.sql", "utf8"));
});
afterAll(async () => {await pg.close();});
function dbClient() {
  return {
    from: () => ({select: () => ({eq: () => ({in: async (_key: string, ids: string[]) => ({data: ids.includes(PROPERTY) ? [{id: PROPERTY}] : [], error: null})})})}),
    rpc: async (name: string, args: Record<string, unknown>) => {
      const values = [args._org, args._property, args._views, args._source, args._occurred_on];
      if (name === "site_feed_record_visit_event") values.push(args._identity, args._event_id);
      const result = await pg.query<{value: boolean}>(`SELECT public.${name}(${values.map((_,i) => `$${i+1}`).join(",")}) AS value`, values);
      return {data: result.rows[0]?.value, error: null};
    },
  } as unknown as SupabaseClient;
}
const total = async () => Number((await pg.query<{n: number}>("SELECT coalesce(sum(views),0) AS n FROM site_feed_visits")).rows[0]?.n);
describe("POST visits — atomic event receipts", () => {
  it("same portal event twice returns 200 deduplicated true and adds once", async () => {
    const before = await total();
    const body = {id: PROPERTY, views: 7, event_id: "event-duplicate"};
    const first = await handleVisitsPost(dbClient(), auth(), body);
    const second = await handleVisitsPost(dbClient(), {...auth(), tokenId: "rotated-token"}, body);
    expect(first.response.status).toBe(200);
    expect(await first.response.json()).toMatchObject({accepted: 1, deduplicated: false, duplicates: 0});
    expect(second.response.status).toBe(200);
    expect(await second.response.json()).toMatchObject({accepted: 1, deduplicated: true, duplicates: 1});
    expect(await total()).toBe(before + 7);
  });
  it("duplicates in a batch and concurrent retries increment once", async () => {
    const before = await total();
    const body = {id: PROPERTY, views: 3, event_id: "event-batch"};
    const response = await handleVisitsPost(dbClient(), auth(), {visits: [body,body]});
    expect(await response.response.json()).toMatchObject({accepted: 2, duplicates: 1});
    await Promise.all([handleVisitsPost(dbClient(),auth(),body),handleVisitsPost(dbClient(),auth(),body)]);
    expect(await total()).toBe(before + 3);
  });
  it("same event from different portals remains independent", async () => {
    const before = await total();
    const body = {id: PROPERTY, views: 2, event_id: "event-cross-portal"};
    await handleVisitsPost(dbClient(),auth("imobli"),body);
    await handleVisitsPost(dbClient(),auth("clickimob"),body);
    expect(await total()).toBe(before + 4);
  });
  it("without event_id preserves repeated increments and the old response", async () => {
    const before = await total();
    const body = {id: PROPERTY, views: 5};
    await handleVisitsPost(dbClient(),auth(),body);
    const res = await handleVisitsPost(dbClient(),auth(),body);
    expect(await res.response.json()).toEqual({accepted: 1,rejected: 0,api_version:"habitoo-site-feed/1.0"});
    expect(await total()).toBe(before + 10);
  });
  it("rejects foreign properties and invalid event_id", async () => {
    const before = await total();
    expect((await handleVisitsPost(dbClient(),auth(),{id: OTHER,event_id:"foreign"})).response.status).toBe(404);
    expect((await handleVisitsPost(dbClient(),auth(),{id: PROPERTY,event_id:""})).response.status).toBe(422);
    expect((await handleVisitsPost(dbClient(),auth(),{id: PROPERTY,event_id:"x".repeat(201)})).response.status).toBe(422);
    expect(await total()).toBe(before);
  });
  it("a failed increment rolls back the receipt and non-service roles cannot execute", async () => {
    const before = await total();
    await expect(pg.query("SELECT site_feed_record_visit_event($1,$2,$3,$4,$5,$6,$7)",[ORG,PROPERTY,2147483647,"","2026-11-07","portal:test","rollback"])).rejects.toThrow();
    expect((await pg.query("SELECT * FROM site_feed_visit_events WHERE event_id='rollback'")).rows).toHaveLength(0);
    expect(await total()).toBe(before);
    await pg.exec("SET ROLE authenticated");
    await expect(pg.query("SELECT site_feed_record_visit_event($1,$2,$3,$4,$5,$6,$7)",[ORG,PROPERTY,1,"","2026-11-07","portal:test","forbidden"])).rejects.toThrow();
    await pg.exec("RESET ROLE");
  });
});