import { describe, expect, it } from "vitest";
import {
  collaborationCommissionSchema,
  parseOptionalCollaborationCommission,
  resolveCollaborationCommission,
} from "./collaboration-commission";

describe("collaboration commission", () => {
  it("keeps an explicit property commission", () => {
    expect(resolveCollaborationCommission(3.5, 7)).toBe(3.5);
  });

  it("copies the agency default when the property value is missing", () => {
    expect(resolveCollaborationCommission(null, 7)).toBe(7);
    expect(resolveCollaborationCommission(undefined, 7)).toBe(7);
  });

  it("returns null when neither value exists", () => {
    expect(resolveCollaborationCommission(null, null)).toBeNull();
  });

  it("preserves an explicit zero", () => {
    expect(resolveCollaborationCommission(0, 7)).toBe(0);
  });

  it("validates the agency default between 0 and 100 and accepts an empty field", () => {
    expect(parseOptionalCollaborationCommission("")).toBeNull();
    expect(collaborationCommissionSchema.parse(0)).toBe(0);
    expect(collaborationCommissionSchema.parse(100)).toBe(100);
    expect(() => collaborationCommissionSchema.parse(-0.01)).toThrow();
    expect(() => collaborationCommissionSchema.parse(100.01)).toThrow();
  });
});
