import { describe, expect, it } from "vitest";
import { compactListSearch, ListRestoreTracker, type ListSnapshot } from "./list-state";

const canon = (s: Record<string, unknown>) => { if (s.lista !== "habitoo") return s; const { lista: _l, ...rest } = s; return rest; };
const snap = (s: ListSnapshot | null) => (s ? { ...s, search: compactListSearch(canon(s.search)) } : null);

/** Simulates the MAP page: URL + storage + tracker, counting navigations triggered by restores. */
function simulate(entry: Record<string, unknown>, stored: Record<string, unknown>) {
  const tracker = new ListRestoreTracker();
  const storage = new Map<string, ListSnapshot>([["list", { search: stored, scroll: 400 }]]);
  let url = entry; let navigations = 0;
  for (let i = 0; i < 20; i += 1) {
    const step = tracker.step({ identity: "list", search: compactListSearch(canon(url)), scrollY: 0, saved: snap(storage.get("list") ?? null), familySaved: snap(storage.get("family") ?? null) });
    if (step.action === "restore") { navigations += 1; url = step.search; continue; }
    if (step.action === "save") { storage.set("list", step.snapshot); storage.set("family", step.snapshot); }
    break;
  }
  return { navigations, url, stored: storage.get("list")?.search };
}

describe("list-state restore loop", () => {
  it("saved {lista: habitoo} with an entry without lista does not navigate", () => {
    expect(simulate({}, { lista: "habitoo" })).toEqual({ navigations: 0, url: {}, stored: {} });
  });
  it("saved without lista and entry with lista=habitoo does not navigate", () => {
    expect(simulate({ lista: "habitoo" }, {}).navigations).toBe(0);
  });
  it("state saved during the loop with filters restores at most once and settles", () => {
    const result = simulate({}, { lista: "habitoo", judet: "Ilfov", pagina: 2 });
    expect(result.navigations).toBe(1);
    expect(result.url).toEqual({ judet: "Ilfov", pagina: 2 });
    expect(result.stored).toEqual({ judet: "Ilfov", pagina: 2 });
  });
  it("returning from a listing detail keeps filters, page and scroll without navigation", () => {
    const tracker = new ListRestoreTracker();
    const step = tracker.step({ identity: "list", search: { judet: "Ilfov", pagina: 2 }, scrollY: 0, saved: { search: { judet: "Ilfov", pagina: 2 }, scroll: 900 } });
    expect(step).toMatchObject({ action: "save", scroll: 900 });
  });
  it("clearing filters does not restore the removed state", () => {
    const tracker = new ListRestoreTracker();
    tracker.step({ identity: "list", search: { judet: "Ilfov" }, scrollY: 0, saved: null });
    tracker.clearing = true;
    expect(tracker.step({ identity: "list", search: {}, scrollY: 0, saved: null }).action).toBe("save");
  });
  it("a stale snapshot written mid-restore never triggers a second restore", () => {
    const tracker = new ListRestoreTracker();
    const first = tracker.step({ identity: "list", search: {}, scrollY: 0, saved: { search: { judet: "Ilfov" }, scroll: 0 } });
    expect(first.action).toBe("restore");
    // Restore landed, but storage now holds a different (old) state: must not navigate again.
    const second = tracker.step({ identity: "list", search: { judet: "Ilfov" }, scrollY: 0, saved: { search: {}, scroll: 0 } });
    expect(second.action).toBe("save");
  });
});
