import { describe, expect, it } from "vitest";
import { catchImportsLabel } from "./AgencyStatsTable";

describe("catchImportsLabel", () => {
  it("folosește singularul pentru 1", () => {
    expect(catchImportsLabel(1)).toBe("1 import");
  });
  it("folosește pluralul fără „de” sub 20", () => {
    expect(catchImportsLabel(0)).toBe("0 de importuri");
    expect(catchImportsLabel(3)).toBe("3 importuri");
    expect(catchImportsLabel(19)).toBe("19 importuri");
  });
  it("adaugă „de” pentru 20–99 și multipli de 100", () => {
    expect(catchImportsLabel(20)).toBe("20 de importuri");
    expect(catchImportsLabel(45)).toBe("45 de importuri");
    expect(catchImportsLabel(100)).toBe("100 de importuri");
    expect(catchImportsLabel(115)).toBe("115 importuri");
  });
});
