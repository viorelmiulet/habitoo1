import { beforeEach, afterEach, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
import { loadAgencyPage } from "../public-profiles.server";

const agency = { id: "org-a", name: "Casa Bună", slug: "casa-buna", description: null as string | null,
  has_logo: false, city: "Brașov", phone: null, email: null, website: null, current_access: true, offer_count: 77 };
const stats = { total: 77, sale: 42, rent: 35, types: [{ value: "apartment", count: 77 }], places: [], prices: [], developments: [] };
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://example.test"); vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test-public-key");
  rpc.mockReset();
  rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "public_agency_page" ? [agency] : name === "public_agency_description_stats" ? stats : [] }));
});
afterEach(() => vi.unstubAllEnvs());

it("la orice pagină, textul folosește agregatul complet, nu cele 24 de oferte afișate", async () => {
  const result = await loadAgencyPage("casa-buna", 2);
  expect(result?.agency.description).toContain("77 de oferte");
  expect(result?.agency.description).toContain("42 la vânzare și 35 la închiriere");
  expect(rpc).toHaveBeenCalledWith("public_agency_description_stats", { _slug: "casa-buna" });
  expect(result?.offers.items).toHaveLength(0);
});
it("eroarea agregatului păstrează descrierea proprie și nu strică pagina", async () => {
  rpc.mockImplementation(async (name: string) => name === "public_agency_description_stats"
    ? { error: { message: "unavailable" }, data: null }
    : { error: null, data: name === "public_agency_page" ? [{ ...agency, description: "Descriere proprie" }] : [] });
  const result = await loadAgencyPage("casa-buna", 1);
  expect(result?.agency.description).toBe("Descriere proprie");
  expect(result?.agency.automaticDescription).toBeNull();
});
it("datele publice invalide nu generează cifre sau afirmații", async () => {
  rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "public_agency_page" ? [agency] : name === "public_agency_description_stats" ? { total: "invalid" } : [] }));
  expect((await loadAgencyPage("casa-buna", 1))?.agency.description).toBeNull();
});