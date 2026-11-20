import { describe, it, expect, vi } from "vitest";
import { runCloneJobOnce, type CloneJobDb, type CloneJobItem } from "./clone-jobs";
import { allPortals } from "@/lib/portals/registry";

/** In-memory job store mirroring the DB contract: step returns the pending item until advance commits it. */
function fakeDb(total: number) {
  const state = { processed: 0, pending: null as CloneJobItem | null, clones: 0, finished: null as null | { error: string | null }, released: 0 };
  const db: CloneJobDb = {
    claim: async () => (state.finished ? null : { id: "j", organization_id: "org", development_id: "d", attempts: 1 }),
    step: async () => {
      if (state.pending) return state.pending;
      if (state.processed >= total) return null;
      state.clones += 1; const i = state.processed;
      state.pending = { index: i, copies: [{ original_id: `o${i}`, original_reference: `HB-${i}`, copy_id: `c${i}`, copy_reference: `HB-9${i}` }], skipped: [], files: [{ from: `org/o${i}/a.jpg`, to: `org/c${i}/a.jpg`, copy_id: `c${i}` }] };
      return state.pending;
    },
    advance: async (_j, index) => { if (state.pending?.index === index) { state.processed = index + 1; state.pending = null; } },
    release: async () => { state.released += 1; },
    finish: async (_j, error) => { state.finished = { error }; },
  };
  return { db, state };
}
const deps = (over: Partial<Parameters<typeof runCloneJobOnce>[1]> = {}) => ({
  copyFile: vi.fn(async () => true), removeImage: vi.fn(async () => {}),
  activatedPortals: async () => new Set(["storia"]), definitions: allPortals,
  applySelection: vi.fn(async (_o: string, _p: string, ids: string[]) => ids.map((portalId) => ({ portalId, ok: true, message: null }))), ...over,
});

describe("worker-ul alocării în fundal", () => {
  it("procesează în loturi de 10 și termină la ultimul lot", async () => {
    const { db, state } = fakeDb(25); const d = deps();
    expect(await runCloneJobOnce(db, d)).toMatchObject({ processed: 10, finished: false });
    expect(state.processed).toBe(10); expect(state.released).toBe(1); expect(state.finished).toBeNull();
    await runCloneJobOnce(db, d);
    expect(await runCloneJobOnce(db, d)).toMatchObject({ processed: 5, finished: true });
    expect(state.processed).toBe(25); expect(state.clones).toBe(25); expect(state.finished).toEqual({ error: null });
    expect(d.applySelection).toHaveBeenCalledWith("org", "c0", ["storia"]);
  });

  it("reia după întrerupere de la elementul în curs, fără clonare dublă", async () => {
    const { db, state } = fakeDb(3);
    let calls = 0;
    const crash = deps({ applySelection: vi.fn(async () => { calls += 1; if (calls === 2) throw Object.assign(new Error("worker oprit"), { fatal: true }); return [{ portalId: "storia", ok: true, message: null }]; }) });
    // Simulate a hard stop: advance never happens for item 1 and the run dies before finishing.
    const dying = { ...db, advance: async (j: string, i: number, p: never[], e: number) => { if (i === 1) throw new Error("oprire"); return db.advance(j, i, p, e); }, finish: async () => {} };
    await runCloneJobOnce(dying, crash);
    expect(state.processed).toBe(1); expect(state.pending?.index).toBe(1); expect(state.clones).toBe(2);
    await runCloneJobOnce(db, deps());
    expect(state.processed).toBe(3); expect(state.clones).toBe(3); expect(state.finished).toEqual({ error: null });
  });

  it("o eroare oprește jobul cu motivul", async () => {
    const { db, state } = fakeDb(2);
    await runCloneJobOnce({ ...db, step: async () => { throw new Error("Nu ai drepturi să editezi acest ansamblu."); } }, deps());
    expect(state.finished).toEqual({ error: "Nu ai drepturi să editezi acest ansamblu." });
  });
});
