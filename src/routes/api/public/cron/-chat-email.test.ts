import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn(async (_payload: unknown, _options: unknown) => ({})), sign: vi.fn(async (_path: string, _ttl: number) => ({ data: { signedUrl: "https://example.test/signed-image" }, error: null })), rpc: vi.fn(), from: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => ({ options }) }));
vi.mock("@/integrations/supabase/cron-auth", () => ({ authenticateCronRequest: async () => null }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: mocks.rpc, from: mocks.from, storage: { from: () => ({ createSignedUrl: mocks.sign }) } } }));
vi.mock("@lovable.dev/email-js", () => ({ sendLovableEmail: mocks.send }));
import { Route } from "./chat-email";

describe("chat email cron, simulated delivery only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("LOVABLE_API_KEY", "mock-not-a-real-key");
    mocks.rpc.mockResolvedValue({ data: [{ conversation_id: "conversation-test", recipient_id: "recipient", sender_id: "sender", message_count: 2 }], error: null });
    mocks.from.mockImplementation((table: string) => {
      const response = table === "profiles" ? { data: [{ id: "recipient", email: "recipient@example.test", full_name: "Recipient", organization_id: null }, { id: "sender", full_name: "Sender Test", avatar_url: "test/avatar.png", organization_id: "org" }] }
        : table === "organizations" ? { data: [{ id: "org", name: "Agency Test", logo_path: "test/logo.png" }] }
        : table === "user_roles" ? { data: [{ user_id: "recipient" }] }
        : table === "chat_participants" ? { data: { last_read_at: "2026-10-13T01:00:00Z" }, error: null }
        : { data: [{ body: "Latest unread message" }], count: 4, error: null };
      const chain: Record<string, unknown> = { then: (resolve: (r: unknown) => unknown) => Promise.resolve(response).then(resolve) };
      for (const method of ["select", "in", "eq", "gt", "order", "limit", "maybeSingle"]) chain[method] = () => chain;
      return chain;
    });
  });

  it("retains subject/idempotency, signs images for seven days and sends latest unread preview to the recipient's conversation", async () => {
    const route = Route as unknown as { options: { server: { handlers: { POST: (input: { request: Request }) => Promise<Response> } } } };
    const result = await route.options.server.handlers.POST({ request: new Request("https://example.test/cron", { method: "POST" }) });
    expect((await result.json()).sent).toBe(1);
    expect(mocks.rpc).toHaveBeenCalledWith("chat_email_claim");
    expect(mocks.sign).toHaveBeenCalledWith("test/avatar.png", 604800);
    expect(mocks.sign).toHaveBeenCalledWith("test/logo.png", 604800);
    const payload = mocks.send.mock.calls[0]?.[0] as unknown as { subject: string; text: string; html: string; idempotency_key: string; purpose: string };
    expect(payload.subject).toBe("Ai un mesaj nou de la Sender Test, Agency Test");
    expect(payload.text).toContain("Latest unread message");
    expect(payload.text).toContain("și încă 3 mesaje");
    expect(payload.text).toContain("https://crm.habitoo.ro/superadmin?conversation=conversation-test");
    expect(payload.idempotency_key).toBe(`chat-conversation-test-recipient-${new Date().toISOString().slice(0, 13)}`);
    expect(payload.purpose).toBe("transactional");
  });
});