import { describe, expect, it } from "vitest";
import { decryptConnectionKey, encryptConnectionKey } from "@/lib/connectionKeyCrypto.server";

describe("criptarea cheii de conexiune per utilizator", () => {
  it("readuce exact cheia după criptare", () => {
    const secret = "lovack_" + "a".repeat(40);
    expect(decryptConnectionKey(encryptConnectionKey(secret))).toBe(secret);
  });

  it("nu scrie cheia în clar și folosește un vector diferit la fiecare criptare", () => {
    const secret = "lovack_secret_value_1234567890";
    const a = encryptConnectionKey(secret);
    const b = encryptConnectionKey(secret);
    expect(a).not.toContain("lovack");
    expect(b).not.toContain("lovack");
    expect(a).not.toBe(b);
    expect(decryptConnectionKey(b)).toBe(secret);
  });
});
