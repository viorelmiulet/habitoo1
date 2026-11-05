import { describe, expect, it } from "vitest";
import { portalCanPublish } from "../registry";

describe("Housera în registry", () => {
  it("poate fi bifat la publicare", () => {
    expect(portalCanPublish("housera")).toBe(true);
  });
});
