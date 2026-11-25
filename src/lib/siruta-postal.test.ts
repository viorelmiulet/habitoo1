import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
import { normalizeSirutaPostal } from "./siruta-import.server";
describe("normalizeSirutaPostal", () => {
  it("adaugă zeroul inițial la 5 cifre", () => expect(normalizeSirutaPostal("77040")).toBe("077040"));
  it("păstrează 6 cifre", () => expect(normalizeSirutaPostal("400001")).toBe("400001"));
  it("valori nevalide devin null", () => {
    for (const v of ["0", "", "1234", "1234567", "ab040", null, undefined]) expect(normalizeSirutaPostal(v)).toBeNull();
  });
});
