import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { accessibleGuides, acceptsGuideInput, canShowAutomatically, GUIDE_IDS, guideForPath, implementedGuides, SAFE_SHOW_ACTIONS } from "./onboarding-tour";
import { emptyAiFeatureMap } from "./ai/features/keys";

describe("ghiduri contextuale", () => {
 it("trei ghiduri pornesc numai pe paginile lor", () => {
  expect(GUIDE_IDS).toHaveLength(3);
  expect(guideForPath("/app")?.id).toBe("first-steps");
  expect(guideForPath("/app/properties/")?.id).toBe("properties-list");
  expect(guideForPath("/app/properties/new")?.id).toBe("property-create");
  expect(guideForPath("/app/properties/123")).toBeUndefined();
 });
 it("văzut și sărit nu repornesc automat; preferința oprește tot", () => {
  expect(canShowAutomatically(true, [], "first-steps")).toBe(true);
  expect(canShowAutomatically(true, [{ guide_id: "first-steps" }], "first-steps")).toBe(false);
  expect(canShowAutomatically(false, [], "properties-list")).toBe(false);
 });
 it.each(["agent", "agency_admin"] as const)("agent/admin primește primele trei: %s", role => expect(accessibleGuides(implementedGuides,role,emptyAiFeatureMap())).toHaveLength(3));
 it("funcțiile AI și rolurile ascunse nu au ghid", () => {
  const guide = { ...implementedGuides[0], feature: "ai_media" as const, roles: ["agency_admin" as const] };
  expect(accessibleGuides([guide],"agent",{...emptyAiFeatureMap(),ai_media:true})).toEqual([]);
  expect(accessibleGuides([guide],"agency_admin",emptyAiFeatureMap())).toEqual([]);
  expect(accessibleGuides([guide],"agency_admin",{...emptyAiFeatureMap(),ai_media:true})).toHaveLength(1);
 });
 it("Fă tu necesită o valoare reală; Arată-mi numai acțiuni sigure", () => {
  expect(acceptsGuideInput(" ")).toBe(false); expect(acceptsGuideInput("95000")).toBe(true);
  for (const guide of implementedGuides) for (const step of guide.steps) {
   if (step.mode === "show") expect(SAFE_SHOW_ACTIONS).toContain(step.show);
   if (step.mode === "do") expect(step.selector).not.toMatch(/save|submit|delete|send/);
  }
  expect(implementedGuides[2].steps.at(-1)?.mode).toBeUndefined();
 });
});

describe("progres privat și revendicare atomică în DB izolată", () => {
 it("utilizatori noi agent/admin, două dispozitive, skip, completare și setare", async () => {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid',true),'')::uuid $$; CREATE TABLE public.profiles(id uuid PRIMARY KEY);`);
  await db.exec(readFileSync("drizzle/migrations/0189_interactive_onboarding_guides.sql","utf8"));
  const agent="00000000-0000-0000-0000-000000000001", admin="00000000-0000-0000-0000-000000000002";
  await db.exec(`INSERT INTO profiles VALUES ('${agent}'),('${admin}'); GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated; SET ROLE authenticated; SET test.uid='${agent}';`);
  for (const guide of GUIDE_IDS) {
   const [a,b] = await Promise.all([db.query<{claim:boolean}>("SELECT claim_onboarding_guide($1) AS claim",[guide]),db.query<{claim:boolean}>("SELECT claim_onboarding_guide($1) AS claim",[guide])]);
   expect([a.rows[0].claim,b.rows[0].claim].sort()).toEqual([false,true]);
  }
  await db.query("SELECT finish_onboarding_guide($1,true)",["first-steps"]);
  await db.query("SELECT finish_onboarding_guide($1,false)",["first-steps"]);
  expect((await db.query<{status:string}>("SELECT status FROM onboarding_guide_progress WHERE guide_id='first-steps'")).rows[0].status).toBe("completed");
  await db.exec(`SET test.uid='${admin}';`);
  expect((await db.query("SELECT * FROM onboarding_guide_progress")).rows).toHaveLength(0);
  expect((await db.query<{claim:boolean}>("SELECT claim_onboarding_guide('first-steps') AS claim")).rows[0].claim).toBe(true);
  await db.exec("UPDATE onboarding_guide_settings SET auto_start=false");
  expect((await db.query<{claim:boolean}>("SELECT claim_onboarding_guide('properties-list') AS claim")).rows[0].claim).toBe(false);
  await db.exec("UPDATE onboarding_guide_settings SET auto_start=true");
  expect((await db.query<{claim:boolean}>("SELECT claim_onboarding_guide('properties-list') AS claim")).rows[0].claim).toBe(true);
  await expect(db.query("INSERT INTO onboarding_guide_progress(user_id,guide_id) VALUES($1,'foreign')",[agent])).rejects.toThrow();
  await db.close();
 });
});
