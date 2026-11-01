import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readWorkspaceGmailProfile,
  workspaceGmailConfigStatus,
} from "@/lib/gmail/gmail-workspace.server";

const KEYS = ["LOVABLE_API_KEY", "GOOGLE_MAIL_API_KEY"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

describe("configurarea Gmail-ului Habitoos", () => {
  it("este gata când ambele chei există", () => {
    process.env.LOVABLE_API_KEY = "workspace-token";
    process.env.GOOGLE_MAIL_API_KEY = "connection-key";
    expect(workspaceGmailConfigStatus()).toEqual({ configured: true, missing: [] });
  });

  it("numește piesa lipsă, fără să arate vreo valoare", () => {
    process.env.LOVABLE_API_KEY = "workspace-token";
    delete process.env.GOOGLE_MAIL_API_KEY;
    const status = workspaceGmailConfigStatus();
    expect(status.configured).toBe(false);
    expect(status.missing).toEqual(["GOOGLE_MAIL_API_KEY"]);
    expect(JSON.stringify(status)).not.toContain("workspace-token");
  });
});

describe("citirea profilului Gmail al Habitoos", () => {
  it("cere gateway-ului cu ambele chei și întoarce adresa și numărătorile", async () => {
    process.env.LOVABLE_API_KEY = "workspace-token";
    process.env.GOOGLE_MAIL_API_KEY = "connection-key";
    const fetchMock = vi.fn(async () =>
      Response.json({ emailAddress: "contact@habitoo.ro", messagesTotal: 10, threadsTotal: 8 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(readWorkspaceGmailProfile()).resolves.toEqual({
      email: "contact@habitoo.ro",
      messagesTotal: 10,
      threadsTotal: 8,
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/profile");
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer workspace-token");
    expect(headers.get("X-Connection-Api-Key")).toBe("connection-key");
  });

  it("arunca când gateway-ul refuză, fără să expună cheia", async () => {
    process.env.LOVABLE_API_KEY = "workspace-token";
    process.env.GOOGLE_MAIL_API_KEY = "connection-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 403 })),
    );

    await expect(readWorkspaceGmailProfile()).rejects.toThrow(/403/);
  });

  it("nu pornește nicio cerere dacă o cheie lipsește", async () => {
    process.env.LOVABLE_API_KEY = "workspace-token";
    delete process.env.GOOGLE_MAIL_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(readWorkspaceGmailProfile()).rejects.toThrow(/GOOGLE_MAIL_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
