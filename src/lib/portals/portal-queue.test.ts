import { describe, expect, it } from "vitest";
import { createPortalQueue } from "./portal-queue";

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("coada de portaluri (simulare)", () => {
  it("rulează maximum 3 portaluri odată", async () => {
    const q = createPortalQueue(3);
    const gates = Array.from({ length: 5 }, deferred);
    let active = 0;
    let peak = 0;
    gates.forEach((g, i) =>
      q.enqueue({
        propertyId: "p",
        portalId: `portal-${i}`,
        run: async () => {
          active += 1;
          peak = Math.max(peak, active);
          await g.promise;
          active -= 1;
        },
      }),
    );
    await tick();
    expect(q.running).toBe(3);
    gates.forEach((g) => g.resolve());
    for (let i = 0; i < 5; i += 1) await tick();
    expect(peak).toBe(3);
    expect(q.running).toBe(0);
  });

  it("un eșec nu oprește celelalte portaluri, fiecare are rezultatul lui", async () => {
    const q = createPortalQueue(3);
    const outcomes: Record<string, boolean> = {};
    for (const id of ["storia", "clickimob", "lacheie"]) {
      q.enqueue({
        propertyId: "p",
        portalId: id,
        run: async () => {
          if (id === "storia") throw new Error("respins");
          return id;
        },
        onDone: (r) => {
          outcomes[id] = r.ok;
        },
      });
    }
    for (let i = 0; i < 4; i += 1) await tick();
    expect(outcomes).toEqual({ storia: false, clickimob: true, lacheie: true });
  });

  it("blochează doar portalul în lucru și refuză dubla trimitere", async () => {
    const q = createPortalQueue(3);
    const gate = deferred();
    expect(q.enqueue({ propertyId: "p", portalId: "storia", run: () => gate.promise })).toBe(true);
    expect(q.isBusy("p", "storia")).toBe(true);
    expect(q.isBusy("p", "clickimob")).toBe(false);
    expect(q.isBusy("alta", "storia")).toBe(false);
    expect(q.enqueue({ propertyId: "p", portalId: "storia", run: async () => {} })).toBe(false);
    gate.resolve();
    await tick();
    await tick();
    expect(q.isBusy("p", "storia")).toBe(false);
  });
});
