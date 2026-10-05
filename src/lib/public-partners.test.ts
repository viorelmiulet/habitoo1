import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_PARTNER_KEYS, partnerInitials, toPublicPartners } from "./public-partners";

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const FORBIDDEN = /email|cui|phone|telefon|address|adresa|city|oras|user|agent|count/i;

describe("parteneri publici", () => {
  it("pagina primește doar nume și logo, sortate alfabetic", () => {
    const out = toPublicPartners([
      { id: "00000000-0000-0000-0000-000000000002", name: "Zeta", has_logo: false },
      { id: "00000000-0000-0000-0000-000000000001", name: "Alfa", has_logo: true },
    ]);
    expect(out.map((p) => p.name)).toEqual(["Alfa", "Zeta"]);
    for (const p of out) expect(Object.keys(p).sort()).toEqual([...PUBLIC_PARTNER_KEYS].sort());
    expect(out[0]!.logoUrl).toBe("/api/public/partner-logo/00000000-0000-0000-0000-000000000001");
    expect(out[1]!.logoUrl).toBeNull();
    expect(partnerInitials("MRM Imobiliare")).toBe("MI");
  });
});

describe.skipIf(!url || !key)("acces anonim (doar citire)", () => {
  const anon = () => createClient(url!, key!, { auth: { persistSession: false } });

  it("funcția publică întoarce doar id, nume și existența logo-ului", async () => {
    const { data, error } = await anon().rpc("public_partner_agencies");
    expect(error).toBeNull();
    for (const row of data ?? []) {
      expect(Object.keys(row).sort()).toEqual(["has_logo", "id", "name"]);
      expect(Object.keys(row).some((k) => FORBIDDEN.test(k))).toBe(false);
    }
  });

  it("calea internă a logo-ului nu poate fi citită anonim", async () => {
    const { error } = await anon().rpc("public_partner_logo_path", { _id: "00000000-0000-0000-0000-000000000000" });
    expect(error).not.toBeNull();
  });

  it("tabelele organizations și profiles rămân închise", async () => {
    for (const t of ["organizations", "profiles"] as const) {
      const { data } = await anon().from(t).select("id").limit(1);
      expect(data ?? []).toHaveLength(0);
    }
  });
});
