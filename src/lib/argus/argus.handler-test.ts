/**
 * Teste pe handler-ele Argus (fără transformul RPC): cheia nu ajunge în
 * browser, iar o agenție nu poate folosi cheia alteia.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  del: vi.fn(),
  call: vi.fn(),
  accessToken: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder: Record<string, unknown> = {};
    builder.middleware = () => builder;
    builder.inputValidator = (v: unknown) => {
      builder._v = v;
      return builder;
    };
    builder.handler =
      (fn: (args: { data?: unknown; context: unknown }) => unknown) =>
      async (args: { data?: unknown; context: unknown }) =>
        fn({ ...args, data: builder._v ? (builder._v as (d: unknown) => unknown)(args.data) : args.data });
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeader: () => null,
  setResponseHeader: () => {},
  setResponseStatus: () => {},
}));
vi.mock("@/lib/org-access", () => ({ requireActiveOrgAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({ insert: async () => ({ error: null }) }),
  },
}));
vi.mock("./connection.server", () => ({
  loadArgusConnection: mocks.load,
  saveArgusConnection: mocks.save,
  deleteArgusConnection: mocks.del,
  argusCall: mocks.call,
  argusAccessToken: mocks.accessToken,
}));

import {
  getArgusConnectionStatus,
  saveArgusApiKey,
  disconnectArgus,
  argusSearch,
} from "./argus.functions";

type Handler = (args: { data?: unknown; context: unknown }) => Promise<unknown>;

const ADMIN = { supabase: adminSupabase(), userId: "admin-1" };

function adminSupabase(orgId = "org-1") {
  const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
  const from = vi.fn(() => {
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({ data: { organization_id: orgId }, error: null }),
    };
    return q;
  });
  return { rpc, from };
}

beforeEach(() => vi.clearAllMocks());

describe("starea conexiunii Argus", () => {
  it("expune doar ultimele 4 caractere — niciodată cheia sau tokenul", async () => {
    mocks.load.mockResolvedValue({
      organization_id: "org-1",
      api_key_enc: "enc:super-secret-key",
      api_key_last4: "key9",
      token_enc: "enc:token",
      token_obtained_at: null,
      connected_by: null,
      created_at: "2026-10-25T00:00:00Z",
      updated_at: "2026-10-25T00:00:00Z",
    });
    const result = (await (getArgusConnectionStatus as unknown as Handler)({
      context: ADMIN,
    })) as Record<string, unknown>;
    expect(result).toMatchObject({ connected: true, last4: "key9" });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("super-secret-key");
    expect(serialized).not.toContain("enc:");
    expect(result).not.toHaveProperty("api_key_enc");
    expect(result).not.toHaveProperty("token_enc");
  });

  it("o agenție primește doar propria conexiune (încărcare pe agenția apelantului)", async () => {
    mocks.load.mockResolvedValue(null);
    await (getArgusConnectionStatus as unknown as Handler)({ context: ADMIN });
    expect(mocks.load).toHaveBeenCalledWith(expect.anything(), "org-1");
  });

  it("un non-admin nu poate citi starea conexiunii", async () => {
    const notAdmin = {
      supabase: { ...adminSupabase(), rpc: vi.fn().mockResolvedValue({ data: false, error: null }) },
      userId: "agent-1",
    };
    await expect(
      (getArgusConnectionStatus as unknown as Handler)({ context: notAdmin }),
    ).rejects.toThrow("Acces refuzat");
    expect(mocks.load).not.toHaveBeenCalled();
  });
});

describe("salvarea și ștergerea cheii", () => {
  it("salvează cheia pe agenția apelantului, nu pe alta", async () => {
    await (saveArgusApiKey as unknown as Handler)({
      data: { apiKey: "argus-key-123456" },
      context: ADMIN,
    });
    expect(mocks.save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ organizationId: "org-1", apiKey: "argus-key-123456" }),
    );
  });

  it("respinge chei prea scurte înainte de orice scriere", async () => {
    await expect(
      (saveArgusApiKey as unknown as Handler)({ data: { apiKey: "abc" }, context: ADMIN }),
    ).rejects.toThrow();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("deconectarea șterge conexiunea agenției apelantului", async () => {
    await (disconnectArgus as unknown as Handler)({ context: ADMIN });
    expect(mocks.del).toHaveBeenCalledWith(expect.anything(), "org-1");
  });
});

describe("accesul la datele Argus", () => {
  it("căutarea folosește conexiunea agenției apelantului și nu salvează nimic", async () => {
    mocks.call.mockResolvedValue({ properties: [], total: 0 });
    const db = adminSupabase("org-2");
    await (argusSearch as unknown as Handler)({
      data: { page: 1, counties: [40] },
      context: { supabase: db, userId: "agent-2" },
    });
    // apelul Argus se face strict cu agenția apelantului (org-2)
    expect(mocks.call).toHaveBeenCalledWith(
      expect.anything(),
      "org-2",
      expect.objectContaining({ path: "/properties/search" }),
    );
  });
});
