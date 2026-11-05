import { describe, expect, it } from "vitest";
import { houseraPendingView } from "./status-view";

describe("Housera în moderare", () => {
  it("celula housera cu state syncing → „În moderare Housera”", () => {
    expect(houseraPendingView("housera", "syncing")).toEqual({ label: "În moderare Housera", pill: "pending" });
    expect(houseraPendingView("housera", "published")).toBeNull();
  });
});
