import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), read: vi.fn(), select: vi.fn(), eq: vi.fn(), audit: vi.fn(), impersonation: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validator: (input: unknown) => unknown = input => input;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: (input: unknown) => unknown) => { validator = fn; return builder; },
      handler: (fn: (args: { data: unknown; context: unknown }) => unknown) => (args: { data: unknown; context: unknown }) => fn({ ...args, data: validator(args.data) }),
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/impersonation.functions", () => ({ assertNoActiveImpersonation: mock.impersonation }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  rpc: mock.rpc,
  from: (table: string) => {
    if (table === "audit_logs") return { insert: mock.audit };
    const q = { select: (cols: string) => { mock.select(cols); return q; }, eq: (col: string, value: string) => { mock.eq(col, value); return q; }, maybeSingle: mock.read };
    return q;
  },
} }));
vi.mock("../immoflux/connection.server", () => ({ encryptImmofluxKey: () => ({ encrypted: "v1.mock-encrypted", digest: "mock-internal-id" }), unlockImmofluxKey: () => "mock-credential" }));
import { getImmofluxConnection, saveImmofluxConnection, testImmofluxConnection } from "../immoflux/connection.functions";
type Handler = (args: { data: unknown; context: unknown }) => Promise<unknown>;
const ORG = "00000000-0000-4000-8000-000000000001";
const context = (isSuper: boolean) => ({ userId: "superadmin", supabase: { rpc: vi.fn().mockResolvedValue({ data: isSuper, error: null }) } });
beforeEach(() => {
  vi.clearAllMocks(); vi.unstubAllGlobals();
  mock.read.mockResolvedValue({ data: { host: "agency.immoflux.ro", slug: "habitoo", enabled: true, api_key_encrypted: "v1.mock-encrypted" }, error: null });
  mock.rpc.mockResolvedValue({ error: null }); mock.audit.mockResolvedValue({ error: null });
});
describe("authenticated IMMOFLUX handlers", () => {
  it.each([getImmofluxConnection, saveImmofluxConnection, testImmofluxConnection])("non-superadmin cannot read, save or test", async fn => {
    await expect((fn as unknown as Handler)({ data: { organizationId: ORG, host: "agency.immoflux.ro", slug: "habitoo", enabled: true }, context: context(false) })).rejects.toThrow(/exclusiv SuperAdmin/);
    expect(mock.read).not.toHaveBeenCalled(); expect(mock.rpc).not.toHaveBeenCalled(); expect(mock.audit).not.toHaveBeenCalled();
  });
  it("metadata never exposes a credential or internal digest", async () => {
    const result = await (getImmofluxConnection as unknown as Handler)({ data: { organizationId: ORG }, context: context(true) });
    expect(result).toEqual({ organizationId: ORG, host: "agency.immoflux.ro", slug: "habitoo", enabled: true, configured: true });
    expect(mock.select).toHaveBeenCalledWith("organization_id,host,slug,enabled");
    expect(mock.eq).toHaveBeenCalledWith("organization_id", ORG);
  });
  it("save sends encrypted data only to the transactional RPC for the selected agency", async () => {
    const result = await (saveImmofluxConnection as unknown as Handler)({ data: { organizationId: ORG, host: "agency.immoflux.ro", slug: "habitoo", enabled: true, apiKey: "mock-credential" }, context: context(true) });
    expect(result).toEqual({ saved: true });
    expect(mock.rpc).toHaveBeenCalledWith("save_immoflux_connection", expect.objectContaining({ _organization_id: ORG, _encrypted: "v1.mock-encrypted", _actor: "superadmin" }));
    expect(mock.read).not.toHaveBeenCalled();
  });
  it("duplicate identity returns the clear agency-conflict message, never raw database detail", async () => {
    mock.rpc.mockResolvedValue({ error: { code: "23505", message: "provider internal detail" } });
    await expect((saveImmofluxConnection as unknown as Handler)({ data: { organizationId: ORG, host: "agency.immoflux.ro", slug: "habitoo", enabled: true }, context: context(true) })).rejects.toThrow("Această configurare IMMOFLUX este deja folosită de altă agenție.");
  });
  it.each([200,401,404])("test HTTP %s reads exactly the selected agency and audits sanitized results", async status => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ total: 139 }), { status }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await (testImmofluxConnection as unknown as Handler)({ data: { organizationId: ORG }, context: context(true) });
    expect(result).toMatchObject({ ok: status === 200, httpStatus: status });
    expect(mock.eq).toHaveBeenCalledExactlyOnceWith("organization_id", ORG);
    expect(mock.audit).toHaveBeenCalledWith({ organization_id: ORG, actor_id: "superadmin", created_by: "superadmin", action: "immoflux.tested", entity: "immoflux_connections", entity_id: ORG, new_values: { ok: status === 200, http_status: status, total: status === 200 ? 139 : null } });
  });
});