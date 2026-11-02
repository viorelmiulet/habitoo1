import { describe, expect, it, vi } from "vitest";
import { readListing } from "./publish";
import { checkVumsiStatuses, type VumsiStatusRow } from "./status";

const NOW = Date.parse("2026-11-02T20:30:00Z");
const row = (): VumsiStatusRow => ({ external_id: "HBT-1-V", vumsi_uuid: "u1", status: 1, public_url: "https://vumsi.com/a/1", expires_at: null, status_checked_at: null, deleted_at: null });

describe("readListing: formatul statusului", () => {
  it("număr", () => expect(readListing({ status: 2 }).status).toBe(2));
  it("text numeric", () => expect(readListing({ status: "4" }).status).toBe(4));
  it("nume de status", () => {
    expect(readListing({ status: "published" }).status).toBe(2);
    expect(readListing({ status: "pending_review" }).status).toBe(1);
    expect(readListing({ status: "disabled_by_company" }).status).toBe(6);
  });
  it("obiect, ca în răspunsul real", () => {
    const l = readListing({ status: { value: 2, code: "published", label: "Publicat" }, url: "https://vumsi.com/x", expires_at: "2027-01-31T12:03:29Z" });
    expect(l).toMatchObject({ status: 2, url: "https://vumsi.com/x", expires_at: "2027-01-31T12:03:29Z" });
    expect(readListing({ status: { code: "rejected" } }).status).toBe(4);
    expect(readListing({ status: { id: "5", name: "expired" } }).status).toBe(5);
  });
  it("răspuns necunoscut → statusul anterior rămâne", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rows = [row()];
    const call = vi.fn(async () => ({ ok: true as const, data: { status: { foo: "bar" } } }));
    const changed = await checkVumsiStatuses(call, readListing, rows, () => true, NOW);
    expect(changed).toHaveLength(0);
    expect(rows[0]).toMatchObject({ status: 1, status_checked_at: null });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
