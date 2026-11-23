import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ scope: vi.fn(), enabled: vi.fn(), requests: vi.fn(), insert: vi.fn(), update: vi.fn(), adminInsert: vi.fn(), adminUpdate: vi.fn(), rpc: vi.fn() }));
const requestId = "00000000-0000-4000-8000-000000000002";
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  let validator = (data: unknown) => data;
  const query = { middleware: () => query, inputValidator: (fn: (data: unknown) => unknown) => { validator = fn; return query; }, handler: (fn: (args: unknown) => unknown) => (args: { data: unknown }) => fn({ data: validator(args.data), context: { userId: "agent-a", supabase: { from: () => chain(false), rpc: m.rpc } } }) }; return query;
} }));
function chain(admin: boolean) {
  const query = { insert: (patch: unknown) => { (admin ? m.adminInsert : m.insert)(patch); return query; }, update: (patch: unknown) => { (admin ? m.adminUpdate : m.update)(patch); return query; }, eq: () => query, select: () => query, single: async () => ({ data: { id: requestId }, error: null }), maybeSingle: async () => ({ data: { id: requestId }, error: null }), then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve) }; return query;
}
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./context.server", () => ({ clientScope: m.scope, entityRequests: m.requests }));
vi.mock("./paid.server", () => ({ assertClientAiEnabled: m.enabled }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => chain(true) } }));
import { confirmCallRequest } from "./client-assist.functions";
const input = { entity: { kind: "contact" as const, id: "00000000-0000-4000-8000-000000000001" }, requestId: null, source: "Vreau să cumpăr 3 camere în Cluj.", request: { kind: "buy" as const, rooms_min: 3, cities: ["Cluj", "Iași"] }, fields: ["kind", "rooms_min"] };
beforeEach(() => { for (const fn of Object.values(m)) fn.mockReset(); m.scope.mockResolvedValue({ organizationId: "org-from-verified-contact", agentId: "agent-a" }); m.enabled.mockResolvedValue(undefined); m.requests.mockResolvedValue([]); m.rpc.mockResolvedValue({ data: requestId, error: null }); });
describe("explicit server confirmation of dictated request", () => {
  it("fără câmpuri confirmate nu există scrieri", async () => {
    expect(() => confirmCallRequest({ data: { ...input, fields: [] } })).toThrow(); expect(m.insert).not.toHaveBeenCalled(); expect(m.adminInsert).not.toHaveBeenCalled();
  });
  it("revocarea AI înainte de confirmare blochează salvarea", async () => {
    m.enabled.mockRejectedValue(new Error("AI dezactivat")); expect((await confirmCallRequest({ data: input })).ok).toBe(false); expect(m.insert).not.toHaveBeenCalled();
  });
  it("cererea altui contact sau agent nu se actualizează", async () => {
    expect((await confirmCallRequest({ data: { ...input, requestId } })).ok).toBe(false); expect(m.update).not.toHaveBeenCalled();
    m.scope.mockRejectedValue(new Error("Fișa nu este disponibilă.")); expect((await confirmCallRequest({ data: input })).ok).toBe(false); expect(m.insert).not.toHaveBeenCalled();
  });
  it("creează doar câmpurile confirmate și folosește agenția verificată, nu din cerere", async () => {
    expect((await confirmCallRequest({ data: input })).ok).toBe(true);
    expect(m.insert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ organization_id: "org-from-verified-contact", contact_id: input.entity.id, assigned_to: "agent-a", kind: "buy", rooms_min: 3 }));
    expect(m.insert.mock.calls[0]?.[0]).not.toHaveProperty("cities"); expect(m.rpc).not.toHaveBeenCalled();
  });
  it("actualizează cererea existentă doar cu valori confirmate și dovedite", async () => {
    m.requests.mockResolvedValue([{ id: requestId, kind: "buy", rooms_min: 2, updated_at: "2026-11-23" }]);
    expect((await confirmCallRequest({ data: { ...input, requestId, fields: ["rooms_min"] } })).ok).toBe(true);
    expect(m.update).toHaveBeenCalledExactlyOnceWith({ rooms_min: 3, updated_by: "agent-a" }); expect(m.insert).not.toHaveBeenCalled();
  });
  it("lead-ul reutilizează confirmarea tranzacțională fără înlocuirea scorului sau ciornei existente", async () => {
    expect((await confirmCallRequest({ data: { ...input, entity: { ...input.entity, kind: "lead" } } })).ok).toBe(true);
    expect(m.adminInsert.mock.calls[0]?.[0]).toMatchObject({ organization_id: "org-from-verified-contact", extracted: { kind: "buy", rooms_min: 3 } });
    expect(m.adminInsert.mock.calls[0]?.[0]).not.toHaveProperty("score");
    expect(m.rpc).toHaveBeenCalledExactlyOnceWith("confirm_lead_ai_request", { _insight: requestId, _fields: ["kind", "rooms_min"] });
    expect(m.adminUpdate).toHaveBeenCalledExactlyOnceWith({ status: "skipped", skip_reason: "dictated_call_confirmed" }); expect(m.insert).not.toHaveBeenCalled();
  });
});