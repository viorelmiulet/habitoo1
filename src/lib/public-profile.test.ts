import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  PUBLIC_AGENCY_LIST_KEYS,
  publicSlugError,
  publicSlugify,
} from "./public-profile";

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

describe("slug public", () => {
  it("elimină diacriticele și spațiile", () => {
    expect(publicSlugify("MRM Imobiliare București")).toBe("mrm-imobiliare-bucuresti");
    expect(publicSlugError("Ăla rău")).not.toBeNull();
    expect(publicSlugError("mrm-imobiliare-2")).toBeNull();
  });
});

describe.skipIf(!url || !key)("citire anonimă (doar citește, nu modifică nimic)", () => {
  const anon = () => createClient(url!, key!, { auth: { persistSession: false } });

  it("lista publică întoarce doar câmpuri publice", async () => {
    const { data, error } = await anon().rpc("public_agencies_list");
    expect(error).toBeNull();
    for (const row of data ?? []) {
      expect(Object.keys(row).sort()).toEqual([...PUBLIC_AGENCY_LIST_KEYS].sort());
    }
  });

  it("slug inexistent → null", async () => {
    const { data, error } = await anon().rpc("public_agency_by_slug", { _slug: "nu-exista-xyz-123" });
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("tabelele organizations și profiles rămân închise anonimilor", async () => {
    for (const t of ["organizations", "profiles"] as const) {
      const { data } = await anon().from(t).select("id").limit(1);
      expect(data ?? []).toHaveLength(0);
    }
  });
});
