import { describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { storage: { from: () => ({ download: mocks.download }) } } }));
import { copyListingPhotos } from "./private-listing-import.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
describe("portfolio gallery copying", () => {
  it("copies every available mirrored image in order and skips an unavailable image", async () => {
    const filename = "00000000-0000-4000-8000-000000000001";
    const images = [0, 1, 2].map(i => `https://crm.habitoo.ro/api/public/listings/media/${filename}?p=ad/${i}-${filename}.jpg`);
    mocks.download.mockImplementation(async (path: string) => path.includes("/1-") ? { data: null, error: {} } : { data: new Blob([path], { type: "image/jpeg" }), error: null });
    const bodies: string[] = [];
    const upload = vi.fn(async (_path: string, blob: Blob) => { bodies.push(await blob.text()); return { error: null }; });
    const client = { storage: { from: () => ({ upload }) } } as unknown as SupabaseClient<Database>;
    const result = await copyListingPhotos(client, images, "agency", "property");
    expect(mocks.download.mock.calls.map(call => call[0])).toEqual([0, 1, 2].map(i => `ad/${i}-${filename}.jpg`));
    expect(bodies).toEqual([`ad/0-${filename}.jpg`, `ad/2-${filename}.jpg`]);
    expect(result.paths).toHaveLength(2); expect(result.skipped).toBe(1);
    expect(result.paths.every(path => path.startsWith("agency/property/"))).toBe(true);
  });
});