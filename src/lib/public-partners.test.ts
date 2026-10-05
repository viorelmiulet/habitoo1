import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  PUBLIC_PARTNER_KEYS,
  partnerInitials,
  toPublicAgencyAgents,
  toPublicAgencyProfile,
  toPublicPartners,
} from "./public-partners";

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const FORBIDDEN = /email|cui|address|adresa|city|oras|user|count/i;

describe("parteneri publici", () => {
  it("pagina primește doar nume, slug și logo, sortate alfabetic", () => {
    const out = toPublicPartners([
      { id: "00000000-0000-0000-0000-000000000002", name: "Zeta", has_logo: false, public_slug: "zeta" },
      { id: "00000000-0000-0000-0000-000000000001", name: "Alfa", has_logo: true, public_slug: null },
    ]);
    expect(out.map((p) => p.name)).toEqual(["Alfa", "Zeta"]);
    for (const p of out) expect(Object.keys(p).sort()).toEqual([...PUBLIC_PARTNER_KEYS].sort());
    expect(out[0]!.logoUrl).toBe("/api/public/partner-logo/00000000-0000-0000-0000-000000000001");
    expect(out[0]!.slug).toBeNull();
    expect(out[1]!.slug).toBe("zeta");
    expect(partnerInitials("MRM Imobiliare")).toBe("MI");
  });

  it("profilul public expune doar câmpurile sigure ale agenției", () => {
    const agency = toPublicAgencyProfile({
      id: "00000000-0000-0000-0000-000000000001",
      name: "Alfa Imobiliare",
      description: "Descriere publică",
      has_logo: true,
      slug: "alfa-imobiliare",
    });
    expect(agency).toEqual({
      id: "00000000-0000-0000-0000-000000000001",
      name: "Alfa Imobiliare",
      slug: "alfa-imobiliare",
      description: "Descriere publică",
      logoUrl: "/api/public/partner-logo/00000000-0000-0000-0000-000000000001",
    });
  });

  it("telefonul agentului apare doar când public_show_phone e activat", () => {
    const agents = toPublicAgencyAgents([
      { full_name: "Ana Pop", job_title: "Agent imobiliar", bio: "Bio", phone: "0722 000 000" },
      { full_name: "Dan Ionescu", job_title: null, bio: null, phone: null },
    ]);
    expect(agents[0]!.phone).toBe("0722 000 000");
    expect(agents[1]!.phone).toBeNull();
    for (const agent of agents) {
      expect(Object.keys(agent).sort()).toEqual(["bio", "fullName", "jobTitle", "phone"].sort());
    }
  });

  it(" lista goală de agenți e acceptată", () => {
    expect(toPublicAgencyAgents(null)).toEqual([]);
  });
});

describe.skipIf(!url || !key)("acces anonim (doar citire)", () => {
  const anon = () => createClient(url!, key!, { auth: { persistSession: false } });

  it("funcția publică întoarce doar id, nume, slug și existența logo-ului", async () => {
    const { data, error } = await anon().rpc("public_partner_agencies");
    expect(error).toBeNull();
    for (const row of data ?? []) {
      expect(Object.keys(row).sort()).toEqual(["has_logo", "id", "name", "public_slug"]);
      expect(Object.keys(row).some((k) => FORBIDDEN.test(k))).toBe(false);
    }
  });

  it("calea internă a logo-ului nu poate fi citită anonim", async () => {
    const { data, error } = await anon().rpc("public_partner_logo_path", { _id: "00000000-0000-0000-0000-000000000000" });
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("profilul unui slug inexistent rămâne gol", async () => {
    const { data, error } = await anon().rpc("public_agency_profile", { _slug: "nu-exista" });
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("tabelele organizations și profiles rămân închise", async () => {
    for (const t of ["organizations", "profiles"] as const) {
      const { data } = await anon().from(t).select("id").limit(1);
      expect(data ?? []).toHaveLength(0);
    }
  });
});
