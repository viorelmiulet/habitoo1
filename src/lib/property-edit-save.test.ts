import { describe, expect, it } from "vitest";
import { savePropertyEdits } from "./property-edit-save";

describe("ordinary edits and responsible agent", () => {
  it("saves details before reassigning", async () => {
    const order: string[] = [];
    expect(await savePropertyEdits({ assignmentChanged: true,
      saveDetails: async () => { order.push("details"); },
      reassign: async () => { order.push("reassign"); return { blocked: [], phoneWarning: null }; },
    })).toEqual([]);
    expect(order).toEqual(["details", "reassign"]);
  });
  it("keeps edits when slots block assignment, preserving the exact message", async () => {
    let title = "vechi";
    const warnings = await savePropertyEdits({ assignmentChanged: true,
      saveDetails: async () => { title = "nou"; },
      reassign: async () => ({ blocked: [{ message: "Agentul nu are locuri libere pe Imobiliare.ro" }], phoneWarning: null }),
    });
    expect(title).toBe("nou");
    expect(warnings).toEqual(["Agentul nu are locuri libere pe Imobiliare.ro"]);
  });
  it("agent edits never submit reassignment", async () => {
    let requests = 0;
    await savePropertyEdits({ assignmentChanged: false, saveDetails: async () => {},
      reassign: async () => { requests++; return { blocked: [], phoneWarning: null }; },
    });
    expect(requests).toBe(0);
  });
  it("returns server role rejection while preserving ordinary edits", async () => {
    let saved = false;
    expect(await savePropertyEdits({ assignmentChanged: true, saveDetails: async () => { saved = true; },
      reassign: async () => { throw new Error("Doar managerul agenției poate realoca anunțuri."); },
    })).toEqual(["Doar managerul agenției poate realoca anunțuri."]);
    expect(saved).toBe(true);
  });
});