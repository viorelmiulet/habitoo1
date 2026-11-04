import { describe, expect, it } from "vitest";
import { defaultMobileStage, resolveMobileStage, stageChangeAction } from "./lead-pipeline";

const cols = ["new", "contacted", "viewing", "lost"] as const;
type S = (typeof cols)[number];

describe("lead pipeline (simulat)", () => {
  it("alege implicit prima etapă cu lead-uri", () => {
    expect(defaultMobileStage<S>(cols, [{ stage: "viewing" }, { stage: "lost" }])).toBe("viewing");
  });
  it("fără lead-uri revine la prima etapă", () => {
    expect(defaultMobileStage<S>(cols, [])).toBe("new");
  });
  it("păstrează alegerea utilizatorului chiar dacă etapa e goală", () => {
    expect(resolveMobileStage<S>("contacted", cols, [{ stage: "viewing" }])).toBe("contacted");
  });
  it("„Pierdut” cere motivul, celelalte etape mută direct", () => {
    expect(stageChangeAction("new", "lost")).toBe("ask-lost-reason");
    expect(stageChangeAction("new", "viewing")).toBe("move");
    expect(stageChangeAction("new", "new")).toBe("none");
  });
});
