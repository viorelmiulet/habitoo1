import { describe, it, expect } from "vitest";
import { republishBatchPairs, republishStartArgs, selectRepublishPairs, splitRepublishSkipped, REPUBLISH_BUSY_MESSAGE, AUTO_PULL_MESSAGE } from "../republish";

const props = [{ id: "p1", status: "active", deleted_at: null, assigned_to: "u" }];
const portals = ["imobiliare_ro", "storia", "clickimob", "imobli", "locuit"];
const sel = selectRepublishPairs({
  scope: "all", userId: "u", portalFilter: null, activePortals: new Set(portals), properties: props,
  listings: portals.map((portal) => ({ property_id: "p1", portal, status: "published", external_id: "x" })),
  publications: portals.map((portal_key) => ({ property_id: "p1", portal_key, enabled: true })),
});

describe("RP1 republicare fără portaluri cu feed", () => {
  it("batch-ul conține doar portalurile push", () => {
    const pairs = republishBatchPairs(sel);
    expect(pairs.map((p) => p.portalId).sort()).toEqual(["imobiliare_ro", "storia"]);
    const args = republishStartArgs({ organizationId: "o", userId: "u", scope: "all", portalKeys: [], kind: "republish", operation: "republish", superadmin: false, syncExisting: true, skippedItems: [], pairs: pairs.map((p) => ({ ...p, nextAttemptAt: "t" })), busyMessage: REPUBLISH_BUSY_MESSAGE });
    expect(args._pairs).toHaveLength(2);
    expect(args._skipped_items).toEqual([]);
  });
  it("sumarul numără doar „deja în curs”; batch-urile vechi păstrează sărite", () => {
    const sk = splitRepublishSkipped([{ message: REPUBLISH_BUSY_MESSAGE }, { message: AUTO_PULL_MESSAGE }]);
    expect(sk.busy).toHaveLength(1);
    expect(sk.other).toHaveLength(1);
  });
});
