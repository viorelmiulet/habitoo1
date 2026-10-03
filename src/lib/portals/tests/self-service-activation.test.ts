import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { agencyPortalCardState } from "@/lib/portals/grid-state";
import { portalActivationMode } from "@/lib/portals/registry";

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
vi.mock("@/lib/org-access", () => ({ requireActiveOrgAuth: {} }));

const apply = vi.fn(async () => ({ ok: true, activated: true }));
vi.mock("@/lib/portals.functions", () => ({ applyPortalActivationForOrg: apply }));
const laCheie = vi.fn(async () => ({}));
vi.mock("@/lib/portals/lacheie.functions", () => ({ runLaCheieAgencyActivation: laCheie }));

let connection: Record<string, unknown> | null = null;
const writes: { table: string; op: string; row: unknown }[] = [];
function chain(table: string) {
  const q: Record<string, unknown> = {};
  for (const k of ["select", "eq", "order", "limit", "in", "is"]) q[k] = () => q;
  q["maybeSingle"] = async () => ({ data: table === "portal_connections" ? connection : null, error: null });
  q["insert"] = async (row: unknown) => {
    writes.push({ table, op: "insert", row });
    return { error: null };
  };
  q["update"] = (row: unknown) => {
    writes.push({ table, op: "update", row });
    return q;
  };
  return q;
}
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (t: string) => chain(t) },
}));

const OWN = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
function ctx(isOrgAdmin: boolean) {
  return {
    userId: "u1",
    supabase: {
      rpc: async () => ({ data: isOrgAdmin, error: null }),
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { organization_id: OWN } }) }) }),
      }),
    },
  } as never;
}

describe("modul de activare din registru", () => {
  it("self_service / oauth / approval, OLX moștenește de la Storia", () => {
    expect(portalActivationMode("clickimob")).toBe("self_service");
    expect(portalActivationMode("properstar")).toBe("self_service");
    expect(portalActivationMode("lacheie")).toBe("self_service");
    expect(portalActivationMode("storia")).toBe("oauth");
    expect(portalActivationMode("olx")).toBe("oauth");
    for (const id of ["homepitch", "imove", "imobiliare_ro", "romimo", "publi24", "primulanunt", "nou"]) {
      expect(portalActivationMode(id)).toBe("approval");
    }
  });
});

describe("agencyPortalCardState pe tip de activare", () => {
  it("self_service neactivat → Activează", () => {
    expect(agencyPortalCardState({ activated: false, activation: "self_service", request: null }).key).toBe("activate");
  });
  it("self_service activat cu eroare → Eroare", () => {
    const s = agencyPortalCardState({ activated: true, activation: "self_service", connectionStatus: "error", request: null });
    expect(s).toMatchObject({ key: "connected", label: "Eroare", tone: "danger" });
  });
  it("oauth fără cont legat → Conectează contul (și dacă e activat)", () => {
    expect(agencyPortalCardState({ activated: false, activation: "oauth", request: null }).key).toBe("oauth");
    expect(agencyPortalCardState({ activated: true, activation: "oauth", connectionStatus: "disconnected", request: null }).key).toBe("oauth");
    expect(agencyPortalCardState({ activated: true, activation: "oauth", connectionStatus: "connected", request: null })).toMatchObject({ key: "connected", label: "Conectat" });
  });
  it("approval rămâne ca înainte", () => {
    expect(agencyPortalCardState({ activated: false, activation: "approval", request: null }).key).toBe("request");
  });
});

describe("selfActivatePortalForSession", () => {
  beforeEach(() => {
    connection = null;
    writes.length = 0;
    apply.mockClear();
    laCheie.mockClear();
  });
  const load = () => import("@/lib/portal-activation.functions");

  it("adminul propriu activează, cu aceeași logică ca Superadminul", async () => {
    const { selfActivatePortalForSession } = await load();
    const r = await selfActivatePortalForSession(ctx(true), { portalId: "clickimob" });
    expect(r).toEqual({ ok: true, alreadyActive: false, error: null });
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ organizationId: OWN, portalId: "clickimob", activated: true, source: "self_service" }));
    expect(writes.some((w) => w.table === "audit_logs")).toBe(true);
  });
  it("agentul primește 403", async () => {
    const { selfActivatePortalForSession, PortalAccessError } = await load();
    await expect(selfActivatePortalForSession(ctx(false), { portalId: "clickimob" })).rejects.toBeInstanceOf(PortalAccessError);
    expect(apply).not.toHaveBeenCalled();
  });
  it("adminul altei agenții primește 403", async () => {
    const { selfActivatePortalForSession, PortalAccessError } = await load();
    await expect(selfActivatePortalForSession(ctx(true), { portalId: "clickimob", organizationId: OTHER })).rejects.toBeInstanceOf(PortalAccessError);
  });
  it("portal approval respins pe calea self-service", async () => {
    const { selfActivatePortalForSession, PortalAccessError } = await load();
    await expect(selfActivatePortalForSession(ctx(true), { portalId: "imobiliare_ro" })).rejects.toBeInstanceOf(PortalAccessError);
    expect(apply).not.toHaveBeenCalled();
  });
  it("idempotent: deja activat nu scrie nimic", async () => {
    connection = { id: "c", activated: true, last_sync_error: null };
    const { selfActivatePortalForSession } = await load();
    const r = await selfActivatePortalForSession(ctx(true), { portalId: "properstar" });
    expect(r.alreadyActive).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });
  it("La Cheie: eșecul extern salvează eroarea, nu activează curat", async () => {
    laCheie.mockRejectedValueOnce(new Error("portal indisponibil"));
    const { selfActivatePortalForSession } = await load();
    const r = await selfActivatePortalForSession(ctx(true), { portalId: "lacheie" });
    expect(r.ok).toBe(false);
    const upd = writes.find((w) => w.table === "portal_connections" && w.op === "update");
    expect(upd?.row).toMatchObject({ last_sync_status: "error", last_sync_error: "portal indisponibil" });
    expect(apply).not.toHaveBeenCalled();
  });
  it("cererea pending se închide automat cu notă (în logica comună)", () => {
    const src = readFileSync("src/lib/portals.functions.ts", "utf8");
    expect(src).toContain('status: "approved"');
    expect(src).toContain('{ note: "activare automată" }');
  });
  it("portalurile self_service nu mai generează cereri noi", () => {
    const src = readFileSync("src/lib/portal-activation.functions.ts", "utf8");
    expect(src).toContain('portalActivationMode(definition.id) === "self_service"');
  });
});

describe("ClickImob activat automat la crearea agenției", () => {
  const file = readdirSync("drizzle/migrations").filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(`drizzle/migrations/${f}`, "utf8"))
    .find((sql) => sql.includes("auto_activate_clickimob_on_org_create"))!;
  it("trigger AFTER INSERT pe organizations, conexiune activată", () => {
    expect(file).toMatch(/AFTER INSERT ON public\.organizations/);
    expect(file).toContain("'clickimob', true, jsonb_build_object('allow_live', true), 'ready'");
  });
  it("a doua rulare nu dublează și nu suprascrie", () => {
    expect(file).toContain("ON CONFLICT (organization_id, portal) DO NOTHING");
  });
  it("eroarea nu blochează crearea agenției și se auditează sursa", () => {
    expect(file).toMatch(/EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/);
    expect(file).toContain("'source', 'auto_on_create'");
  });
});
