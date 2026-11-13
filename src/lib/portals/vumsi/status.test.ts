import { describe, expect, it, vi } from "vitest";
import { readListing } from "./publish";
import { aggregateVumsiStatus, checkVumsiStatuses, vumsiBackoffUntil, vumsiCardView, vumsiFailStep, vumsiListingPatch, vumsiOnOpenDue, vumsiScheduledDue, vumsiShouldLogFailure, VUMSI_GONE_MESSAGE, type VumsiStatusRow } from "./status";

const NOW = Date.parse("2026-11-02T12:00:00Z");
const row = (o: Partial<VumsiStatusRow> = {}): VumsiStatusRow => ({
  external_id: "HBT-1-V", vumsi_uuid: "u1", status: 1, public_url: "https://vumsi.com/a/1", expires_at: null,
  status_checked_at: null, deleted_at: null, ...o,
});
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("Vumsi status real", () => {
  it("status 2 → published și „Publicat”", async () => {
    const call = vi.fn(async () => ({ ok: true as const, data: { uuid: "u1", status: 2, url: "https://vumsi.com/a/1", expires_at: "2026-12-30T00:00:00Z" } }));
    const rows = [row()];
    const changed = await checkVumsiStatuses(call, readListing, rows, (r) => vumsiOnOpenDue(r, NOW), NOW);
    expect(call).toHaveBeenCalledWith("GET", "/listings/u1/");
    expect(changed).toHaveLength(1);
    const agg = aggregateVumsiStatus(rows)!;
    expect(agg.portalStatus).toBe("published");
    expect(vumsiCardView(agg.status).label).toBe("Publicat");
    expect(vumsiListingPatch(agg, null, "x")).toMatchObject({ status: "published", public_url: "https://vumsi.com/a/1", last_error: null });
  });

  it("status 1 → „În moderare Vumsi”, pending", () => {
    const agg = aggregateVumsiStatus([row({ status: 1 })])!;
    expect(agg.portalStatus).toBe("pending");
    expect(vumsiCardView(1)).toMatchObject({ label: "În moderare Vumsi", pill: "pending" });
  });

  it("status 4 → eroare cu motivul", async () => {
    const call = vi.fn(async () => ({ ok: true as const, data: { uuid: "u1", status: 4, rejection_reason: "Poze necorespunzătoare" } }));
    const rows = [row()];
    await checkVumsiStatuses(call, readListing, rows, () => true, NOW);
    const agg = aggregateVumsiStatus(rows)!;
    expect(agg.portalStatus).toBe("error");
    expect(vumsiCardView(agg.status, agg.reason)).toMatchObject({ label: "Respins de Vumsi", pill: "error", reason: "Poze necorespunzătoare" });
    expect(vumsiListingPatch(agg, null, "x").last_error).toBe("Respins de Vumsi: Poze necorespunzătoare");
  });

  it("5/6/0 → withdrawn cu etichetele Expirat/Dezactivat/Retras", () => {
    expect([5, 6, 0].map((s) => vumsiCardView(s).label)).toEqual(["Expirat", "Dezactivat", "Retras"]);
    expect(aggregateVumsiStatus([row({ status: 5 })])!.portalStatus).toBe("withdrawn");
  });

  it("cel mult o verificare pe minut pe anunț", async () => {
    const call = vi.fn(async () => ({ ok: true as const, data: { status: 1 } }));
    await checkVumsiStatuses(call, readListing, [row({ status_checked_at: ago(30_000) })], (r) => vumsiOnOpenDue(r, NOW), NOW);
    expect(call).not.toHaveBeenCalled();
    await checkVumsiStatuses(call, readListing, [row({ status_checked_at: ago(61_000) })], (r) => vumsiOnOpenDue(r, NOW), NOW);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("cadența programată: moderare la 30 min, publicat o dată pe zi", () => {
    expect(vumsiScheduledDue(row({ status: 1, status_checked_at: ago(20 * 60_000) }), NOW)).toBe(false);
    expect(vumsiScheduledDue(row({ status: null, status_checked_at: ago(31 * 60_000) }), NOW)).toBe(true);
    expect(vumsiScheduledDue(row({ status: 2, status_checked_at: ago(5 * 3600_000) }), NOW)).toBe(false);
    expect(vumsiScheduledDue(row({ status: 2, status_checked_at: ago(25 * 3600_000) }), NOW)).toBe(true);
    expect(vumsiScheduledDue(row({ status: 5, status_checked_at: ago(48 * 3600_000) }), NOW)).toBe(false);
  });

  it("păstrează o eroare de publicare care nu vine din refuzul Vumsi", () => {
    const agg = aggregateVumsiStatus([row({ status: 2 })])!;
    expect(vumsiListingPatch(agg, "Eroare la actualizare", "x").last_error).toBe("Eroare la actualizare");
    expect(vumsiListingPatch(agg, "Respins de Vumsi.", "x").last_error).toBeNull();
  });
});

describe("Vumsi: erori la verificarea statusului (V3)", () => {
  const fail = (status: number, kind: string) => vi.fn(async () => ({ ok: false as const, kind, status }));

  it("404 → Retras (0), ieșit din verificarea programată, last_error setat", async () => {
    const r = row({ status: 1, status_checked_at: ago(3600_000) });
    const failures: any[] = [];
    await checkVumsiStatuses(fail(404, "not_found"), readListing, [r], () => true, NOW, undefined, failures);
    expect(r.status).toBe(0);
    expect(failures[0]).toMatchObject({ gone: true, httpStatus: 404 });
    expect(vumsiScheduledDue(r, NOW + 365 * 86400_000)).toBe(false);
    expect(VUMSI_GONE_MESSAGE).toBe("Anunțul nu mai există la Vumsi");
    expect(vumsiShouldLogFailure(failures[0], null, NOW)).toBe(false);
  });

  it("403 de 3 ori → status_checked_at avansează, următoarea verificare la ≥ 6 h, un log pe zi", async () => {
    const r = row({ status: 1, status_checked_at: ago(3600_000) });
    let t = NOW;
    let lastLog: string | null = null;
    let logs = 0;
    const checked: number[] = [];
    for (let i = 0; i < 3; i++) {
      const failures: any[] = [];
      await checkVumsiStatuses(fail(403, "forbidden"), readListing, [r], (x) => vumsiScheduledDue(x, t), t, undefined, failures);
      expect(failures).toHaveLength(1);
      expect(r.status).toBe(1);
      if (vumsiShouldLogFailure(failures[0], lastLog, t)) { logs++; lastLog = new Date(t).toISOString(); }
      checked.push(Date.parse(r.status_checked_at!));
      t = vumsiBackoffUntil(r)!;
    }
    expect(checked[1]! > checked[0]! && checked[2]! > checked[1]!).toBe(true);
    expect(vumsiFailStep(r)).toBe(3);
    expect(t - (NOW + 30 * 60_000 + 2 * 3600_000)).toBeGreaterThanOrEqual(6 * 3600_000 - 1000);
    expect(vumsiScheduledDue(r, t - 60_000)).toBe(false);
    expect(vumsiOnOpenDue(r, t - 60_000)).toBe(false);
    expect(logs).toBe(1); // 30 min + 2 h < 24 h
  });

  it("succes după eroare → status normal, cadența obișnuită", async () => {
    const r = row({ status: 1, status_checked_at: ago(3600_000) });
    await checkVumsiStatuses(fail(403, "forbidden"), readListing, [r], () => true, NOW);
    expect(vumsiFailStep(r)).toBe(1);
    const t = vumsiBackoffUntil(r)!;
    const ok = vi.fn(async () => ({ ok: true as const, data: { status: 2 } }));
    await checkVumsiStatuses(ok, readListing, [r], (x) => vumsiScheduledDue(x, t), t);
    expect(r.status).toBe(2);
    expect(vumsiFailStep(r)).toBe(0);
    expect(vumsiScheduledDue(r, t + 23 * 3600_000)).toBe(false);
    expect(vumsiScheduledDue(r, t + 24 * 3600_000 + 1000)).toBe(true);
  });

  it("12 anunțuri blocate → o rulare face cel mult o cerere fiecare, următoarea (10 min) niciuna", async () => {
    const rows = Array.from({ length: 12 }, (_, i) => row({ external_id: `E${i}`, vumsi_uuid: `u${i}`, status: 1, status_checked_at: "2026-11-10T15:50:00.000Z" }));
    const call = fail(403, "forbidden");
    const T = Date.parse("2026-11-13T10:00:00Z");
    await checkVumsiStatuses(call, readListing, rows, (x) => vumsiScheduledDue(x, T), T);
    expect(call).toHaveBeenCalledTimes(12);
    const t2 = T + 10 * 60_000;
    await checkVumsiStatuses(call, readListing, rows, (x) => vumsiScheduledDue(x, t2), t2);
    expect(call).toHaveBeenCalledTimes(12);
  });
});
