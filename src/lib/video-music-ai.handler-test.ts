/**
 * Teste cu răspunsuri simulate pentru generarea AI de muzică: coadă → gata →
 * descărcare → rând nou inactiv; eroare → nimic salvat; doar SuperAdmin are acces.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ core: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = { middleware: () => builder, inputValidator: () => builder, handler: (fn: unknown) => fn };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { marker: "admin" } }));
vi.mock("@/lib/video-music-ai.server", () => ({ generateAiMusicTrack: mocks.core }));

import { generateVideoMusic } from "./video-music-ai.functions";
import type { AiMusicDb } from "./video-music-ai.server";

// Modulul server e mimat pentru wrapper; testele de bază folosesc implementarea reală.
const realServer = await vi.importActual<typeof import("./video-music-ai.server")>("./video-music-ai.server");
const realGenerate = realServer.generateAiMusicTrack;

const handler = generateVideoMusic as unknown as (args: { data: { title: string; style: string; durationSec: number }; context: unknown }) => Promise<unknown>;

function authContext(isSuperadmin: boolean, organizationId: string | null = null) {
  const rpc = vi.fn().mockResolvedValue({ data: isSuperadmin, error: null });
  const from = vi.fn(() => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { organization_id: organizationId } }) };
    return q;
  });
  return { supabase: { rpc, from }, userId: "superadmin-user" };
}

const input = { title: "Pian calm", style: "Calm", description: "pian calm, modern", durationSec: 60 };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env["FAL_KEY"];
  mocks.core.mockResolvedValue({ id: "track-1", title: input.title, durationSec: 60, storagePath: "tracks/track-1.wav" });
});

describe("acces SuperAdmin", () => {
  it("respinge un utilizator care nu este SuperAdmin fără să cheme generarea", async () => {
    process.env["FAL_KEY"] = "test-key";
    await expect(handler({ data: input, context: authContext(false) })).rejects.toThrow("Acces refuzat.");
    expect(mocks.core).not.toHaveBeenCalled();
  });
  it("fără cheie configurată răspunde că generarea nu este configurată", async () => {
    await expect(handler({ data: input, context: authContext(true) })).rejects.toThrow("nu este configurată");
    expect(mocks.core).not.toHaveBeenCalled();
  });
  it("SuperAdmin cu cheie ajunge la generare, fără ca cheia să apară în răspuns", async () => {
    process.env["FAL_KEY"] = "test-key";
    const result = await handler({ data: input, context: authContext(true) });
    expect(mocks.core).toHaveBeenCalledTimes(1);
    expect(mocks.core.mock.calls[0][0]).toMatchObject({ input, userId: "superadmin-user", organizationId: null });
    expect(JSON.stringify(result)).not.toContain("test-key");
  });
});

/** Bază de date falsă: numără generările de azi, ține minte încărcările și rândurile. */
function fakeDb(dailyCount = 0) {
  const calls = { uploads: [] as { path: string }[], removed: [] as string[][], tracks: [] as Record<string, unknown>[], usage: [] as Record<string, unknown>[] };
  const db: AiMusicDb = {
    from: (table: string) => ({
      select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) {
          const q = { eq: () => q, gte: async () => ({ count: dailyCount }) };
          return q;
        }
        return { order: () => ({ limit: async () => ({ data: [{ position: 4 }] }) }) };
      },
      insert: async (row: Record<string, unknown>) => {
        (table === "ai_usage_events" ? calls.usage : calls.tracks).push(row);
        return { error: null };
      },
    }) as never,
    storage: {
      from: () => ({
        upload: async (path: string) => {
          calls.uploads.push({ path });
          return { error: null };
        },
        remove: async (paths: string[]) => {
          calls.removed.push(paths);
          return {};
        },
      }),
    },
  };
  return { db, calls };
}

function falFetchSequence(opts: { submitStatus?: number; queueStatus?: string; audioStatus?: number } = {}) {
  const responses: Response[] = [];
  const submitStatus = opts.submitStatus ?? 200;
  responses.push(new Response(JSON.stringify({ request_id: "r1", status_url: "https://queue.fal.run/status/r1", response_url: "https://queue.fal.run/result/r1" }), { status: submitStatus }));
  if (submitStatus === 200) {
    responses.push(new Response(JSON.stringify({ status: opts.queueStatus ?? "COMPLETED" }), { status: 200 }));
    if ((opts.queueStatus ?? "COMPLETED") === "COMPLETED") {
      responses.push(new Response(JSON.stringify({ audio: { url: "https://cdn.fal.ai/audio/r1.wav", content_type: "audio/wav" } }), { status: 200 }));
      responses.push(new Response(new Uint8Array([1, 2, 3]).buffer, { status: opts.audioStatus ?? 200, headers: { "content-type": "audio/wav" } }));
    }
  }
  const fetchFn = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch");
    return next;
  });
  return fetchFn;
}

const sleep = async () => {};

describe("generarea propriu-zisă", () => {
  it("coadă → gata → descărcare → rând nou inactiv, cu eveniment de utilizare", async () => {
    const { db, calls } = fakeDb();
    const result = await realGenerate(
      { apiKey: "k", input, userId: "u", organizationId: null, db },
      { fetchFn: falFetchSequence() as never, sleep },
    );
    expect(result.durationSec).toBe(60);
    expect(result.storagePath).toMatch(/^tracks\/.+\.wav$/);
    expect(calls.uploads).toHaveLength(1);
    expect(calls.tracks).toHaveLength(1);
    expect(calls.tracks[0]).toMatchObject({
      title: "Pian calm",
      style: "Calm",
      artist: "Habitoo AI",
    expect(calls.tracks[0]).not.toHaveProperty("description");
      license: "Generat AI – ACE-Step (fal.ai)",
      active: false,
      duration_sec: 60,
      position: 5,
    });
    expect(calls.usage).toHaveLength(1);
    expect(calls.usage[0]).toMatchObject({ provider: "fal", model: "ace-step", capability: "music", success: true, tokens_unknown: true });
    expect(calls.removed).toHaveLength(0);
  });

  it("eroare la pornire → nimic salvat, eveniment nereușit", async () => {
    const { db, calls } = fakeDb();
    await expect(
      realGenerate({ apiKey: "k", input, userId: "u", organizationId: null, db }, { fetchFn: falFetchSequence({ submitStatus: 500 }) as never, sleep }),
    ).rejects.toThrow("Încearcă din nou");
    expect(calls.uploads).toHaveLength(0);
    expect(calls.tracks).toHaveLength(0);
    expect(calls.usage).toEqual([expect.objectContaining({ success: false })]);
  });

  it("generare eșuată în coadă → nimic salvat", async () => {
    const { db, calls } = fakeDb();
    await expect(
      realGenerate({ apiKey: "k", input, userId: "u", organizationId: null, db }, { fetchFn: falFetchSequence({ queueStatus: "FAILED" }) as never, sleep }),
    ).rejects.toThrow("a eșuat");
    expect(calls.uploads).toHaveLength(0);
    expect(calls.tracks).toHaveLength(0);
  });

  it("limita de 30 pe zi oprește generarea înainte de orice apel", async () => {
    const { db, calls } = fakeDb(30);
    const fetchFn = vi.fn();
    await expect(
      realGenerate({ apiKey: "k", input, userId: "u", organizationId: null, db }, { fetchFn: fetchFn as never, sleep }),
    ).rejects.toThrow("30 de generări pe zi");
    expect(fetchFn).not.toHaveBeenCalled();
    expect(calls.tracks).toHaveLength(0);
    expect(calls.usage).toHaveLength(0);
  });

  it("cerere invalidă → nimic apelat", async () => {
    const { db, calls } = fakeDb();
    await expect(
      realGenerate({ apiKey: "k", input: { ...input, title: "" }, userId: "u", organizationId: null, db }, { fetchFn: vi.fn() as never, sleep }),
    ).rejects.toThrow("titlul");
    expect(calls.tracks).toHaveLength(0);
  });
});
