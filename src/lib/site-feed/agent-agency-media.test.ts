import { describe, expect, it, vi } from "vitest";
import { mapAgent, type ProfileRow } from "./mapper";
import { agencyLogoRedirect, agentPhotoRedirect } from "./media-redirect.server";

const ID = "11111111-1111-4111-8111-111111111111";
const base = "https://crm.habitoo.ro";
const profile = (o: Partial<ProfileRow>) =>
  ({ id: ID, full_name: "A", email: null, phone: null, job_title: null, is_active: true, avatar_url: null, ...o }) as ProfileRow;

function fakeDb(row: unknown) {
  return {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://s/x?t=1" } }) }) },
  } as never;
}

describe("mapAgent poza", () => {
  it("URL stabil când există poză", () => {
    expect(mapAgent(profile({ avatar_url: "org/u/a.jpg" }), base).poza).toBe(
      `${base}/api/public/sites/v1/media/agent/${ID}`,
    );
  });
  it("null fără poză", () => expect(mapAgent(profile({}), base).poza).toBeNull());
  it("https existent neschimbat", () =>
    expect(mapAgent(profile({ avatar_url: "https://x.ro/p.jpg" }), base).poza).toBe("https://x.ro/p.jpg"));
});

describe("ruta poză agent", () => {
  it("404 UUID invalid", async () => expect((await agentPhotoRedirect("abc", fakeDb(null))).status).toBe(404));
  it("404 profil inactiv", async () =>
    expect((await agentPhotoRedirect(ID, fakeDb({ id: ID, is_active: false, avatar_url: "p" }))).status).toBe(404));
  it("404 fără poză", async () =>
    expect((await agentPhotoRedirect(ID, fakeDb({ id: ID, is_active: true, avatar_url: null }))).status).toBe(404));
  it("302 cu extensie", async () => {
    const r = await agentPhotoRedirect(`${ID}.jpg`, fakeDb({ id: ID, is_active: true, avatar_url: "p" }));
    expect(r.status).toBe(302);
    expect(r.headers.get("cache-control")).toBe("public, max-age=3600");
  });
});

describe("ruta logo agenție", () => {
  it("404 fără logo", async () =>
    expect((await agencyLogoRedirect(ID, fakeDb({ id: ID, logo_path: null, logo_url: null }))).status).toBe(404));
});

describe("/agency", () => {
  it("cere token, doar nume+logo, fără cale din bucket", async () => {
    vi.resetModules();
    vi.doMock("@/integrations/supabase/client.server", () => ({
      supabaseAdmin: fakeDb({ id: ID, name: "Ag", logo_path: "secret/path/logo.png", logo_url: null, email: "x@y" }),
    }));
    const { handleAgency } = await import("./handlers.server");
    const res = await handleAgency(new Request("https://crm.habitoo.ro/api/public/sites/v1/agency"), {
      organizationId: ID, scopes: ["feed:read"],
    } as never);
    const body = await res.response.json();
    expect(Object.keys(body.data).sort()).toEqual(["logo", "nume"]);
    expect(JSON.stringify(body)).not.toContain("secret/path");
    expect(body.data.logo).toBe(`${base}/api/public/sites/v1/media/agency/${ID}`);
    const denied = await handleAgency(new Request("https://crm.habitoo.ro/x"), { organizationId: ID, scopes: [] } as never);
    expect(denied.response.status).toBe(403);
    const { withFeedAuth } = await import("./auth.server");
    const noToken = await withFeedAuth(new Request("https://crm.habitoo.ro/api/public/sites/v1/agency"), "agency", async () => {
      throw new Error("nu trebuie apelat");
    });
    expect(noToken.status).toBe(401);
  });
});
