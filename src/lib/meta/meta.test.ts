import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { signMetaState, verifyMetaState, parseSignedRequest, META_STATE_TTL_MS, disconnectMetaOrg, buildMetaOAuthUrl } from "./core";
import { saveMetaConnection } from "./meta.server";

const SECRET = "test-secret";
const ORG = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";

function signed(payload: object, secret = SECRET) {
  const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${createHmac("sha256", secret).update(p).digest("base64url")}.${p}`;
}

describe("state OAuth Meta", () => {
  it("valid în 10 minute, legat de agenție și utilizator", () => {
    const s = signMetaState({ organizationId: ORG, userId: USER }, SECRET, 1000);
    expect(verifyMetaState(s, SECRET, 1000 + META_STATE_TTL_MS - 1)).toMatchObject({ organizationId: ORG, userId: USER });
  });
  it("expirat → refuzat", () => {
    const s = signMetaState({ organizationId: ORG, userId: USER }, SECRET, 1000);
    expect(verifyMetaState(s, SECRET, 1000 + META_STATE_TTL_MS + 1)).toBeNull();
  });
  it("modificat sau alt secret → refuzat", () => {
    const s = signMetaState({ organizationId: ORG, userId: USER }, SECRET);
    const [, sig] = s.split(".");
    const forged = Buffer.from(JSON.stringify({ o: "other", u: USER, exp: Date.now() + 60000 })).toString("base64url");
    expect(verifyMetaState(`${forged}.${sig}`, SECRET)).toBeNull();
    expect(verifyMetaState(s, "alt-secret")).toBeNull();
    expect(verifyMetaState(null, SECRET)).toBeNull();
  });
  it("URL-ul de dialog conține config_id și redirect_uri", () => {
    const u = new URL(buildMetaOAuthUrl("abc"));
    expect(u.origin + u.pathname).toBe("https://www.facebook.com/v26.0/dialog/oauth");
    expect(u.searchParams.get("config_id")).toBe("929047083622427");
    expect(u.searchParams.get("redirect_uri")).toBe("https://crm.habitoo.ro/api/public/meta/oauth/callback");
  });
});

describe("signed_request", () => {
  it("acceptă semnătura corectă", () => {
    expect(parseSignedRequest(signed({ algorithm: "HMAC-SHA256", user_id: "123" }), SECRET)?.user_id).toBe("123");
  });
  it("refuză semnătura greșită sau algoritmul greșit", () => {
    expect(parseSignedRequest(signed({ algorithm: "HMAC-SHA256", user_id: "123" }, "rau"), SECRET)).toBeNull();
    expect(parseSignedRequest(signed({ algorithm: "MD5", user_id: "123" }), SECRET)).toBeNull();
    expect(parseSignedRequest("garbage", SECRET)).toBeNull();
  });
});

describe("salvarea paginilor", () => {
  it("refuză când nicio pagină nu are CREATE_CONTENT", async () => {
    const db = { from: vi.fn() };
    await expect(
      saveMetaConnection(db, {
        organizationId: ORG, userId: USER, metaUserId: "9", userToken: "t", expiresIn: null,
        pages: [{ id: "p1", name: "P", access_token: "pt", tasks: ["ANALYZE", "MODERATE"] }],
      }, (s) => `enc:${s}`),
    ).rejects.toMatchObject({ code: "no_postable_pages" });
    expect(db.from).not.toHaveBeenCalled();
  });
});

describe("deconectarea", () => {
  it("revocă la Meta și șterge tokenurile, chiar dacă revocarea eșuează", async () => {
    const clearTokens = vi.fn(async () => {});
    const revoke = vi.fn(async () => { throw new Error("x"); });
    const r = await disconnectMetaOrg({ loadUserToken: async () => "tok", revoke, clearTokens });
    expect(revoke).toHaveBeenCalledWith("tok");
    expect(clearTokens).toHaveBeenCalledOnce();
    expect(r.revoked).toBe(false);
  });
});
