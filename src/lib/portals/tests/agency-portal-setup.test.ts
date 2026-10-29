import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { validatePortalConfigValues } from "@/lib/portals/registry";

vi.mock("@tanstack/react-start", () => {
  const build = () => {
    const self: Record<string, unknown> = {};
    self["middleware"] = () => self;
    self["inputValidator"] = () => self;
    self["handler"] = (fn: unknown) => fn;
    return self;
  };
  return { createServerFn: () => build() };
});
vi.mock("@tanstack/react-start/server", () => ({ setResponseStatus: () => undefined }));
vi.mock("@/lib/org-access", () => ({ requireActiveOrgAuth: {} }));

const save = vi.fn(async () => ({ ok: true }));
const test = vi.fn(async () => ({ ok: true, live: true, detail: null, feed: null }));
const apply = vi.fn(async (i: { activated: boolean }) => ({ ok: true, activated: i.activated }));
const issue = vi.fn(async () => ({ ok: true, key: "hbk_plain", prefix: "hbk_", feedUrl: null }));
vi.mock("@/lib/portals.functions", () => ({
  savePortalConnectionCore: save,
  testPortalConnectionCore: test,
  applyPortalActivationForOrg: apply,
  issuePortalApiKeyCore: issue,
  revokePortalApiKeyCore: vi.fn(async () => ({ ok: true })),
}));

let recentTests = 0;
let connection: Record<string, unknown> | null = null;
function chain(table: string) {
  const q: Record<string, unknown> = {};
  for (const k of ["select", "eq", "order", "limit", "in", "is", "gte"]) q[k] = () => q;
  q["maybeSingle"] = async () => ({ data: table === "portal_connections" ? connection : null, error: null });
  q["then"] = (r: (v: unknown) => unknown) =>
    r(table === "portal_operation_logs" ? { count: recentTests, data: null } : { data: [], error: null });
  return q;
}
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (t: string) => chain(t) } }));

const OWN = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
function ctx(isOrgAdmin: boolean) {
  return {
    userId: "u1",
    supabase: {
      rpc: async () => ({ data: isOrgAdmin, error: null }),
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { organization_id: OWN } }) }) }) }),
    },
  } as never;
}
const load = () => import("@/lib/agency-portal-setup.functions");

beforeEach(() => {
  recentTests = 0;
  connection = null;
  for (const f of [save, test, apply, issue]) f.mockClear();
});

describe("configurare portal de către administratorul agenției", () => {
  it("configurează, testează, activează (source agency) și dezactivează pe agenția din sesiune", async () => {
    const m = await load();
    await m.saveAgencyPortal(ctx(true), { portalId: "imo24", credential: "imo24_" + "a".repeat(40) }).catch(() => undefined);
    await m.saveAgencyPortal(ctx(true), { portalId: "romimo", credential: "k", externalAccountId: "a@b.ro" });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ organizationId: OWN, data: expect.objectContaining({ portalId: "romimo" }) }));
    const t = await m.testAgencyPortal(ctx(true), { portalId: "romimo" });
    expect(t.ok).toBe(true);
    expect(test).toHaveBeenCalledWith(expect.objectContaining({ organizationId: OWN, portalId: "romimo" }));
    await m.setAgencyPortalActivation(ctx(true), { portalId: "romimo", activated: true });
    expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({ organizationId: OWN, activated: true, source: "agency" }));
    await m.setAgencyPortalActivation(ctx(true), { portalId: "romimo", activated: false });
    expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({ activated: false, source: "agency" }));
  });

  it("agenta nu are acces", async () => {
    const m = await load();
    await expect(m.saveAgencyPortal(ctx(false), { portalId: "romimo", credential: "k" })).rejects.toBeInstanceOf(m.AgencyPortalAccessError);
    await expect(m.loadAgencyPortalSetup).toBeDefined();
    await expect(m.setAgencyPortalActivation(ctx(false), { portalId: "romimo", activated: true })).rejects.toBeInstanceOf(m.AgencyPortalAccessError);
    expect(apply).not.toHaveBeenCalled();
  });

  it("nu se poate configura altă agenție", async () => {
    const m = await load();
    await expect(m.saveAgencyPortal(ctx(true), { portalId: "romimo", credential: "k", organizationId: OTHER })).rejects.toBeInstanceOf(m.AgencyPortalAccessError);
    await expect(m.testAgencyPortal(ctx(true), { portalId: "romimo", organizationId: OTHER })).rejects.toBeInstanceOf(m.AgencyPortalAccessError);
    await expect(m.setAgencyPortalActivation(ctx(true), { portalId: "romimo", activated: true, organizationId: OTHER })).rejects.toBeInstanceOf(m.AgencyPortalAccessError);
    expect(save).not.toHaveBeenCalled();
  });

  it("secretele nu se întorc niciodată în răspuns", async () => {
    connection = {
      activated: true,
      external_account_id: "a@b.ro",
      portal_credentials_encrypted: "ENC_SECRET_VALUE",
      settings: { webhook_secret_encrypted: "ENC_WEBHOOK", allow_live: true },
      last_sync_at: null,
      last_sync_status: null,
      last_sync_error: null,
    };
    const m = await load();
    const r = await m.loadAgencyPortalSetup(OWN, "vdi");
    const json = JSON.stringify(r);
    expect(json).not.toContain("ENC_SECRET_VALUE");
    expect(json).not.toContain("ENC_WEBHOOK");
    expect(r.connection.hasPortalCredential).toBe(true);
    expect(r.connection.hasWebhookSecret).toBe(true);
    const imove = await m.loadAgencyPortalSetup(OWN, "imove");
    expect(imove.feedUrl).not.toContain("api_key");
  });

  it("validările de format rulează și pe server", async () => {
    const m = await load();
    await expect(m.saveAgencyPortal(ctx(true), { portalId: "romimo", credential: "k", externalAccountId: "nu-e-email" })).rejects.toThrow();
    await expect(m.saveAgencyPortal(ctx(true), { portalId: "imo24", credential: "gresit" })).rejects.toThrow();
    await expect(m.saveAgencyPortal(ctx(true), { portalId: "zonata", credential: "gresit" })).rejects.toThrow();
    expect(validatePortalConfigValues("imo24", { credential: "gresit" })).not.toBeNull();
    expect(validatePortalConfigValues("zonata", { credential: "gresit" })).not.toBeNull();
    expect(validatePortalConfigValues("romimo", { externalAccountId: "nu-e-email" })).not.toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it("un singur test la 10 secunde pe portal și agenție", async () => {
    const m = await load();
    expect(m.AGENCY_TEST_INTERVAL_MS).toBe(10_000);
    recentTests = 1;
    const r = await m.testAgencyPortal(ctx(true), { portalId: "imove" });
    expect(r).toMatchObject({ ok: false, code: "RATE_LIMIT" });
    recentTests = 0;
    expect((await m.testAgencyPortal(ctx(true), { portalId: "primulanunt" })).ok).toBe(true);
    expect((await m.testAgencyPortal(ctx(true), { portalId: "primulanunt" })).ok).toBe(false);
    expect(test).toHaveBeenCalledTimes(1);
  });

  it("Ofera: ID-ul agenției rămâne doar în SuperAdmin", async () => {
    const m = await load();
    expect(m.agencyEditableFields("ofera")).toEqual([]);
  });
});

describe("interfața", () => {
  it("„Solicită activarea” deschide pagina portalului, iar antetul e cel nou", () => {
    const src = readFileSync("src/components/app/AgencyPortalCatalogCard.tsx", "utf8");
    expect(src).toContain('to="/app/portaluri/$portalId"');
    expect(src).toContain("Setări portal");
    expect(src).toContain("pe pagina fiecărui portal introduci datele de acces și îl activezi singur.");
  });
  it("pagina refuză agenta (doar rolul agency_admin)", () => {
    const src = readFileSync("src/components/app/AgencyPortalSetupPage.tsx", "utf8");
    expect(src).toContain('roles.includes("agency_admin")');
    expect(src).toContain("Înapoi la portaluri");
  });
  it("SuperAdmin păstrează autorizarea și funcțiile neschimbate", () => {
    const src = readFileSync("src/lib/portals.functions.ts", "utf8");
    for (const fn of ["savePortalConnection", "testPortalConnection", "issuePortalApiKey", "revokePortalApiKey", "setPortalActivation", "disconnectPortal"]) {
      const at = src.indexOf(`export const ${fn} = createServerFn`);
      expect(at).toBeGreaterThan(0);
      expect(src.slice(at, at + 700)).toContain("requireSuperadminOrg");
    }
    expect(src).toContain('source: input.source ?? "superadmin"');
  });
});
