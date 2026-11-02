import { describe, expect, it, vi } from "vitest";
import { readListing } from "./publish";
import { aggregateVumsiStatus, checkVumsiStatuses, vumsiCardView, vumsiListingPatch, vumsiOnOpenDue, vumsiScheduledDue, type VumsiStatusRow } from "./status";

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
