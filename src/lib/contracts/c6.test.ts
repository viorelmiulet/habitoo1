/** C6 — un singur scanner de acte. Date fictive, provider AI simulat, fără contracte reale. */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { checkDigit } from "./id/mrz";
import { cnpCheckDigit } from "./id/cnp";
import { resolveScanScope, runIdentityScan, scanRateBucket, type ScanDeps } from "./id/scan.server";
import { applyScanResult, confirmPendingFields, idGenerationBlockers } from "./id/form-state";
import { mergeStoredIdentity } from "./template-vars";
import { IDENTITY_SAVE_WARNING, saveIdentitiesAfterCreate } from "./c6";
import type { AIProvider } from "@/lib/ai/providers/types";

const pad = (s: string, n: number) => (s + "<".repeat(n)).slice(0, n);
const cd = (s: string) => String(checkDigit(s));
const CNP_BASE = "190010141234";
const CNP = CNP_BASE + String(cnpCheckDigit(CNP_BASE + "0"));

/** Pașaport fictiv: MRZ pe 2 rânduri (TD3). */
function td3(): string {
  const l1 = pad("P<ROUPOPESCU<<ION", 44);
  const num = pad("X1234567", 9);
  const personal = pad(CNP, 14);
  const body = num + cd(num) + "ROU" + "900101" + cd("900101") + "M" + "300101" + cd("300101") + personal + cd(personal);
  return `${l1}\n${body}${cd(body.slice(0, 10) + body.slice(13, 20) + body.slice(21, 43))}`;
}

const answer = (o: Record<string, unknown>) =>
  JSON.stringify({ doc_type: "cei", doc_type_confidence: 0.95, mrz: null, fields: {
    last_name: { value: "POPESCU", confidence: 0.9 }, first_name: { value: "ION", confidence: 0.9 },
    cnp: { value: CNP, confidence: 0.95 }, birth_date: { value: "1990-01-01", confidence: 0.9 },
    sex: { value: "M", confidence: 0.95 }, expires_at: { value: "2030-01-01", confidence: 0.9 },
    address: { value: null, confidence: null } }, ...o });

function deps(text: string): ScanDeps {
  const provider = { id: "minimax", model: "m", generate: vi.fn(async () => ({ text, inputTokens: 1, outputTokens: 1 })) } as unknown as AIProvider;
  return { provider, rateLimit: async () => true, prepare: async (i) => ({ mimeType: i.contentType, base64: i.base64 }), audit: async () => {} };
}
const IMG = { contentType: "image/jpeg", base64: "QUJD" };

describe("C6 scope: Document nou și fișa clientului", () => {
  const base = {
    contactOrganization: async () => "org-contact",
    currentOrganization: async () => "org-user",
  };
  it("fără contact: utilizator dintr-o agenție, audit pe agenția lui", async () => {
    const assertContactAccess = vi.fn(async () => {});
    const scope = await resolveScanScope(null, { ...base, assertContactAccess });
    expect(scope).toEqual({ organizationId: "org-user", entity: "contract_party", entityId: null });
    expect(assertContactAccess).not.toHaveBeenCalled();
  });
  it("fără contact și fără agenție: refuzat", async () => {
    await expect(resolveScanScope(undefined, { ...base, currentOrganization: async () => null, assertContactAccess: async () => {} })).rejects.toThrow();
  });
  it("cu contact și acces: audit pe contact", async () => {
    const scope = await resolveScanScope("c1", { ...base, assertContactAccess: async () => {} });
    expect(scope).toEqual({ organizationId: "org-contact", entity: "contact", entityId: "c1" });
  });
  it("cu contact fără acces: refuzat înainte de scanare", async () => {
    await expect(resolveScanScope("c1", { ...base, assertContactAccess: async () => { throw new Error("Nu ai acces"); } })).rejects.toThrow("Nu ai acces");
  });
  it("același bucket orar pentru ambele locuri", () => {
    expect(scanRateBucket("u1")).toBe("contact_identity_scan:user:hour:u1");
  });
  it("agenție cu AI dezactivat: scanarea nu depinde de setarea AI", async () => {
    const src = readFileSync(new URL("./identity-scan.functions.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/isOrgAiEnabled|extractionEnabled|getIdReadingStatus/);
    const out = await runIdentityScan(deps(answer({})), { images: [IMG] });
    expect(out.state).toBe("read");
  });
});

describe("C6 rezultat în formularul de contract", () => {
  it("pașaport cu MRZ pe 2 rânduri: câmpuri „verificat”", async () => {
    const out = await runIdentityScan(deps(answer({ doc_type: "pasaport", mrz: td3() })), { images: [IMG] });
    if (out.state !== "read") throw new Error(out.state);
    const { values, state } = applyScanResult(out.result);
    expect(values).toMatchObject({ fullName: "POPESCU ION", idNumber: "X1234567", birthDate: "01.01.1990" });
    expect(state.verified).toEqual(expect.arrayContaining(["fullName", "idNumber", "birthDate"]));
    expect(state.needsAddress).toBe(false);
  });
  it("CEI fără domiciliu: cere certificatul și blochează crearea până la domiciliu", async () => {
    const out = await runIdentityScan(deps(answer({})), { images: [IMG], docType: "cei" });
    if (out.state !== "read") throw new Error(out.state);
    const { state } = applyScanResult(out.result);
    expect(state.needsAddress).toBe(true);
    expect(idGenerationBlockers([{ label: "Client", state, address: "" }])[0]).toMatch(/certificatul de domiciliu/);
    expect(idGenerationBlockers([{ label: "Client", state, address: "Str. Manual 1" }])).toEqual([]);
  });
  it("câmpurile „de verificat” blochează până la confirmare", async () => {
    const out = await runIdentityScan(deps(answer({ fields: { last_name: { value: "POPESCU", confidence: 0.3 }, first_name: { value: "ION", confidence: 0.9 }, address: { value: "Str. A 1", confidence: 0.9 } } })), { images: [IMG], docType: "ci" });
    if (out.state !== "read") throw new Error(out.state);
    const { state } = applyScanResult(out.result);
    expect(state.pending).toContain("fullName");
    expect(idGenerationBlockers([{ label: "Client", state, address: "Str. A 1" }])).toHaveLength(1);
    expect(idGenerationBlockers([{ label: "Client", state: confirmPendingFields(state), address: "Str. A 1" }])).toEqual([]);
  });
});

describe("C6 combinare și salvare", () => {
  it("valoarea din fereastră câștigă, câmpurile goale se completează", () => {
    const merged = mergeStoredIdentity(
      { fullName: "Ion Popescu", address: "Str. Corectată 5", cnp: "", idSeries: "" },
      { fullName: "POPESCU ION", address: "Str. Veche 1", cnp: CNP, idSeries: "RX" },
    );
    expect(merged).toEqual({ fullName: "Ion Popescu", address: "Str. Corectată 5", cnp: CNP, idSeries: "RX" });
  });
  it("eșecul salvării pe fișă nu blochează contractul: întoarce avertisment", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const save = vi.fn(async () => { throw new Error("db down"); });
    const warning = await saveIdentitiesAfterCreate([{ contactId: "c1", saveIdentity: true, cnp: CNP }, { saveIdentity: true }], save);
    expect(warning).toBe(IDENTITY_SAVE_WARNING);
    expect(save).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls.flat().join(" ")).not.toContain(CNP);
    errors.mockRestore();
    expect(await saveIdentitiesAfterCreate([{ contactId: "c1", saveIdentity: true }], async () => {})).toBeNull();
    expect(await saveIdentitiesAfterCreate([{ contactId: "c1", saveIdentity: false }], save)).toBeNull();
  });
});

describe("C6.1 — scanare fără acces la fișa clientului", () => {
  it("trimite contactId și permite salvarea doar cu acces explicit", async () => {
    const { identityContactId } = await import("./c6");
    expect(identityContactId("c1", { c1: true })).toBe("c1");
    expect(identityContactId("c1", { c1: false })).toBe("");
    expect(identityContactId("c1", {})).toBe("");
    expect(identityContactId("", { "": true })).toBe("");
  });
  it("getContactIdentity întoarce un câmp explicit canAccessIdentity", () => {
    const src = readFileSync("src/lib/contracts/contact-identity.functions.ts", "utf8");
    expect(src).toContain("canAccessIdentity: false");
    expect(src).toContain("canAccessIdentity: true");
    const dialog = readFileSync("src/components/app/contracts/NewContractDialog.tsx", "utf8");
    expect(dialog).not.toContain("contactId={contactFor(");
  });
});
