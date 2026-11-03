/** C4 — scanarea actului: date fictive și răspunsuri AI simulate. */
import { describe, expect, it, vi } from "vitest";
import { checkDigit } from "./mrz";
import { cnpCheckDigit } from "./cnp";
import { buildScanResult, parseAnyMrz, parseScanAnswer } from "./scan";
import { runIdentityScan, type ScanDeps } from "./scan.server";
import type { AIProvider } from "@/lib/ai/providers/types";

const TODAY = new Date("2026-11-03T00:00:00Z");
const pad = (s: string, n: number) => (s + "<".repeat(n)).slice(0, n);
const cd = (s: string) => String(checkDigit(s));

const CNP_BASE = "190010141234"; // fictiv: bărbat, 1990-01-01
const CNP = CNP_BASE + String(cnpCheckDigit(CNP_BASE + "0"));

function td3(): string {
  const l1 = pad("P<ROUPOPESCU<<ION", 44);
  const num = pad("X1234567", 9);
  const personal = pad(CNP, 14);
  const body = num + cd(num) + "ROU" + "900101" + cd("900101") + "M" + "300101" + cd("300101") + personal + cd(personal);
  return `${l1}\n${body}${cd(body.slice(0, 10) + body.slice(13, 20) + body.slice(21, 43))}`;
}

function td1(): string {
  const num = pad("XB123456", 9);
  const l1 = "IDROU" + num + cd(num) + pad(CNP, 15);
  const l2head = "900101" + cd("900101") + "M" + "300101" + cd("300101") + "ROU" + pad("", 11);
  const composite = l1.slice(5, 30) + l2head.slice(0, 7) + l2head.slice(8, 15) + l2head.slice(18, 29);
  return `${l1}\n${l2head}${cd(composite)}\n${pad("POPESCU<<ION", 30)}`;
}

function aiJson(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    doc_type: "cei", doc_type_confidence: 0.95, mrz: null,
    fields: {
      last_name: { value: "POPESCU", confidence: 0.9 }, first_name: { value: "ION", confidence: 0.9 },
      cnp: { value: CNP, confidence: 0.95 }, birth_date: { value: "1990-01-01", confidence: 0.9 },
      sex: { value: "M", confidence: 0.95 }, expires_at: { value: "2030-01-01", confidence: 0.9 },
      address: { value: null, confidence: null },
    },
    ...overrides,
  });
}

describe("parser MRZ", () => {
  it("citește un pașaport fictiv (TD3)", () => {
    const r = parseAnyMrz(td3(), TODAY);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.values).toMatchObject({ format: "TD3", lastName: "POPESCU", firstName: "ION", documentNumber: "X1234567", birthDate: "1990-01-01", expiryDate: "2030-01-01" });
    }
  });
  it("citește un buletin cu cip fictiv (TD1)", () => {
    const r = parseAnyMrz(td1(), TODAY);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.values).toMatchObject({ format: "TD1", documentNumber: "XB123456", lastName: "POPESCU" });
  });
  it("respinge o cifră de control greșită", () => {
    const bad = td3().replace(/^(.*\n.{9})./s, (_m, p: string) => p + ((Number(td3().split("\n")[1]![9]) + 1) % 10));
    const r = parseAnyMrz(bad, TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failures).toContain("check_digit_document_number");
  });
  it("MRZ valid are prioritate față de AI", () => {
    const answer = parseScanAnswer(aiJson({ doc_type: "pasaport", mrz: td3(), fields: { last_name: { value: "POPESCO", confidence: 0.99 } } }));
    const res = buildScanResult(answer, { today: TODAY });
    expect(res.fields.last_name).toMatchObject({ value: "POPESCU", source: "mrz" });
    expect(res.mrz.valid).toBe(true);
  });
});

describe("verificări", () => {
  it("marchează CNP-ul care nu se potrivește cu data nașterii", () => {
    const answer = parseScanAnswer(aiJson({ fields: { cnp: { value: CNP, confidence: 0.9 }, birth_date: { value: "1991-05-05", confidence: 0.9 }, sex: { value: "M", confidence: 0.9 } } }));
    expect(buildScanResult(answer, { today: TODAY }).fields.cnp.flags).toContain("cnp_birth_date_mismatch");
  });
  it("buletinul cu cip fără domiciliu cere certificat sau completare manuală", () => {
    const res = buildScanResult(parseScanAnswer(aiJson()), { today: TODAY });
    expect(res.docType).toBe("cei");
    expect(res.needsAddressSource).toBe(true);
    expect(res.fields.address.flags).toContain("address_required");
    const withCert = buildScanResult(parseScanAnswer(aiJson()), { today: TODAY, certificateAddress: { value: "Str. Fictivă 1, București", confidence: 0.9 } });
    expect(withCert.needsAddressSource).toBe(false);
    expect(withCert.addressSource).toBe("certificat_domiciliu");
  });
  it("avertizează pentru act expirat", () => {
    const res = buildScanResult(parseScanAnswer(aiJson({ fields: { expires_at: { value: "2020-01-01", confidence: 0.9 } } })), { today: TODAY });
    expect(res.expired).toBe(true);
  });
});

describe("runIdentityScan", () => {
  const IMAGE_B64 = Buffer.from("FAKE-IMAGE-BYTES-0123456789").toString("base64");
  function deps(over: Partial<ScanDeps> = {}) {
    const calls: string[] = [];
    const provider = {
      id: "minimax", model: "test",
      generate: vi.fn(async () => ({ text: aiJson(), inputTokens: 10, outputTokens: 5 })),
    } as unknown as AIProvider;
    const d: ScanDeps = {
      provider,
      rateLimit: async () => true,
      prepare: async (img) => ({ mimeType: img.contentType, base64: img.base64 }),
      audit: async (a) => { calls.push(a); },
      ...over,
    };
    return { d, calls, provider };
  }

  it("nu salvează nimic înainte de confirmare și nu scrie imaginea în storage sau loguri", async () => {
    const logs: string[] = [];
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(" ")); }));
    const { d, calls } = deps();
    const out = await runIdentityScan(d, { images: [{ contentType: "image/jpeg", base64: IMAGE_B64 }] });
    spies.forEach((s) => s.mockRestore());
    expect(out.state).toBe("read");
    /* Singura scriere permisă: auditul „act scanat”, fără date. */
    expect(calls).toEqual(["contact_identity.scanned"]);
    expect(JSON.stringify(out)).not.toContain(IMAGE_B64);
    expect(logs.join("\n")).not.toContain(IMAGE_B64);
    /* Modulul de scanare nu are acces la storage sau la tabele. */
    expect(Object.keys(d).sort()).toEqual(["audit", "prepare", "provider", "rateLimit"]);
  });

  it("respectă limita orară și dimensiunea", async () => {
    const { d, provider } = deps({ rateLimit: async () => false });
    expect((await runIdentityScan(d, { images: [{ contentType: "image/jpeg", base64: IMAGE_B64 }] })).state).toBe("rate_limited");
    expect(provider.generate).not.toHaveBeenCalled();
    const big = "A".repeat(14_000_001);
    expect((await runIdentityScan(deps().d, { images: [{ contentType: "image/jpeg", base64: big }] })).state).toBe("invalid");
  });
});
