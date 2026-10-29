import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const builder = { middleware: () => builder, inputValidator: () => builder, handler: (fn: unknown) => fn };
  return builder;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
const build = vi.fn(async () => ({ ok: false, bodies: [], reasons: ["ID furnizor lipsă"], warnings: [] }));
vi.mock("./preview.server", () => ({ buildOferaPreview: build }));
const writes = vi.fn(async () => ({ error: null }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => ({ upsert: writes, insert: writes }) } }));
import { previewOferaPayload, saveOferaPriceCurrency } from "./preview.functions";
type Handler = (input: { data: { propertyId?: string; currency?: string }; context: { supabase: { rpc: ReturnType<typeof vi.fn> }; userId: string } }) => Promise<unknown>;
const preview = previewOferaPayload as unknown as Handler;
const save = saveOferaPriceCurrency as unknown as Handler;
const context = (allowed: boolean) => ({ supabase: { rpc: vi.fn(async () => ({ data: allowed })) }, userId: "super-test" });
describe("Ofera preview boundary", () => {
  beforeEach(() => vi.clearAllMocks());
  it("non-SuperAdmin cannot read property or preview", async () => { await expect(preview({ data: { propertyId: "property-test" }, context: context(false) })).rejects.toThrow("SuperAdmin"); expect(build).not.toHaveBeenCalled(); });
  it("SuperAdmin preview reads without writes and retains blockers", async () => { expect(await preview({ data: { propertyId: "property-test" }, context: context(true) })).toMatchObject({ ok: false, reasons: ["ID furnizor lipsă"] }); expect(build).toHaveBeenCalledWith("property-test"); expect(writes).not.toHaveBeenCalled(); });
  it("non-SuperAdmin cannot change global currency", async () => { await expect(save({ data: { currency: "RON" }, context: context(false) })).rejects.toThrow("SuperAdmin"); expect(writes).not.toHaveBeenCalled(); });
  it("SuperAdmin saves RON setting and audits it", async () => { expect(await save({ data: { currency: "RON" }, context: context(true) })).toBe("RON"); expect(writes).toHaveBeenCalledWith(expect.objectContaining({ key: "ofera_price_currency", value: "RON", updated_by: "super-test" })); expect(writes).toHaveBeenCalledWith(expect.objectContaining({ action: "platform.settings_updated" })); });
});