import { describe, expect, it, vi } from "vitest";
import {
  IMOSPOT_DEFAULT_SETTINGS,
  buildImospotEmail,
  missingImospotFields,
  notifyImospotForRequest,
  type ImospotCompanyData,
  type NotifyDeps,
  type NotifyRequestRow,
} from "./imospot-key-request";

const complete: ImospotCompanyData = {
  agencyName: "Agenția Test",
  legalName: "Test Imobiliare SRL",
  cui: "RO123456",
  tradeRegistryNumber: "J40/1/2020",
  adminName: "Ana Pop",
  adminEmail: "ana@test.ro",
  adminPhone: "0722123456",
  city: "Cluj-Napoca",
  activeListings: 4,
};

function harness(opts: { company?: ImospotCompanyData; row?: Partial<NotifyRequestRow>; sendOk?: boolean; to?: string } = {}) {
  const row: NotifyRequestRow = {
    id: "r1", organizationId: "o1", portal: "imospot", status: "approved",
    notifyRequired: true, notifiedAt: null, ...opts.row,
  };
  let company = opts.company ?? complete;
  const send = vi.fn(async () => (opts.sendOk === false ? { ok: false, error: "503" } : { ok: true }));
  const saves: { notifiedAt?: string; error: string | null }[] = [];
  const audits: Record<string, unknown>[] = [];
  const deps: NotifyDeps = {
    loadRequest: async () => ({ ...row }),
    loadCompany: async () => company,
    loadSettings: async () => ({ ...IMOSPOT_DEFAULT_SETTINGS, ...(opts.to ? { to: opts.to } : {}) }),
    send,
    save: async (_id, patch) => {
      saves.push(patch);
      if (patch.notifiedAt) row.notifiedAt = patch.notifiedAt;
    },
    audit: async (_r, v) => void audits.push(v),
    now: () => "2026-10-04T09:00:00.000Z",
  };
  return { deps, send, saves, audits, row, setCompany: (c: ImospotCompanyData) => (company = c) };
}

describe("cererea de cheie Imospot", () => {
  it("trimite la aprobare cu date complete, cu Cc și Reply-To corecte", async () => {
    const h = harness();
    expect(await notifyImospotForRequest(h.deps, "r1")).toEqual({ status: "sent" });
    const email = (h.send.mock.calls as unknown[][])[0]![0] as unknown as ReturnType<typeof buildImospotEmail>;
    expect(email.to).toBe("info@imospot.ro");
    expect(email.from).toContain("contact@habitoo.ro");
    expect(email.cc).toBe("contact@habitoo.ro");
    expect(email.replyTo).toBe("ana@test.ro");
    expect(email.subject).toBe("Solicitare cheie API Imospot — Test Imobiliare SRL (CUI RO123456)");
    expect(email.text).toContain("J40/1/2020");
    expect(email.text).toContain("/app/settings?tab=portals");
    expect(h.audits[0]).toMatchObject({ success: true });
  });

  it("nu retrimite la o aprobare repetată", async () => {
    const h = harness();
    await notifyImospotForRequest(h.deps, "r1");
    expect(await notifyImospotForRequest(h.deps, "r1")).toEqual({ status: "skipped", reason: "already_sent" });
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it("nu trimite cu date incomplete și listează câmpurile lipsă", async () => {
    const h = harness({ company: { ...complete, cui: null, tradeRegistryNumber: "", adminPhone: null } });
    const out = await notifyImospotForRequest(h.deps, "r1");
    expect(out).toEqual({ status: "incomplete", missing: ["CUI", "Nr. Registrul Comerțului", "Telefon administrator"] });
    expect(h.send).not.toHaveBeenCalled();
    expect(h.saves[0]!.error).toBe("Date firmă incomplete: CUI, Nr. Registrul Comerțului, Telefon administrator");
  });

  it("trimite automat după completarea datelor", async () => {
    const h = harness({ company: { ...complete, legalName: null } });
    await notifyImospotForRequest(h.deps, "r1");
    h.setCompany(complete);
    expect(await notifyImospotForRequest(h.deps, "r1")).toEqual({ status: "sent" });
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it("reține eroarea la eșec, iar retrimiterea funcționează", async () => {
    const h = harness({ sendOk: false });
    const out = await notifyImospotForRequest(h.deps, "r1");
    expect(out.status).toBe("failed");
    expect(h.saves.at(-1)!.error).toContain("Trimiterea a eșuat");
    expect(h.row.notifiedAt).toBeNull();
    const ok = harness();
    ok.row.notifiedAt = "2026-10-01T00:00:00.000Z";
    expect(await notifyImospotForRequest(ok.deps, "r1", { force: true })).toEqual({ status: "sent" });
  });

  it("folosește destinatarul configurat de Superadmin", async () => {
    const h = harness({ to: "parteneri@imospot.ro" });
    await notifyImospotForRequest(h.deps, "r1");
    expect(((h.send.mock.calls as unknown[][])[0]![0] as unknown as { to: string }).to).toBe("parteneri@imospot.ro");
  });

  it("nu trimite pentru aprobările vechi sau alte portaluri", async () => {
    for (const row of [{ notifyRequired: false }, { portal: "storia" }, { status: "pending" }]) {
      const h = harness({ row });
      expect((await notifyImospotForRequest(h.deps, "r1")).status).toBe("skipped");
      expect(h.send).not.toHaveBeenCalled();
    }
  });

  it("câmpurile obligatorii", () => {
    expect(missingImospotFields(complete)).toEqual([]);
  });
});
