import { describe, expect, it, vi } from "vitest";
import { directHomedirectImages } from "./images.server";
import { imo24ImageUrls } from "../imo24/publish";

const property = { publish_status: "published", status: "active", deleted_at: null } as const;
const base = "https://crm.habitoo.ro";
const images = [
  { id: "860209f3-1111-4111-8111-111111111111", storage_path: "hd1/b.jpg", url: null, include_in_publish: true, is_confidential: false, position: 2 },
  { id: "860209f3-2222-4111-8111-111111111111", storage_path: "hd1/a.jpg", url: null, include_in_publish: true, is_confidential: false, position: 1 },
  { id: "860209f3-3333-4111-8111-111111111111", storage_path: "hd1/private.jpg", url: null, include_in_publish: true, is_confidential: true },
];

describe("HD1 HomeDirect gallery", () => {
  it("sends direct 24-hour signatures in gallery order without changing other portal URLs", async () => {
    const sign = vi.fn(async (path: string) => ({ data: { signedUrl: `https://media.example/${path}?signature=test` } }));
    const db = { storage: { from: () => ({ createSignedUrl: sign }) } } as never;
    const selected = imo24ImageUrls(images, { baseUrl: base, watermark: false }).urls;
    const result = await directHomedirectImages(db, selected, images, property, null);
    expect(result).toEqual(["https://media.example/hd1/a.jpg?signature=test", "https://media.example/hd1/b.jpg?signature=test"]);
    expect(sign.mock.calls.map((c) => c.slice(0, 2))).toEqual([["hd1/a.jpg", 86400], ["hd1/b.jpg", 86400]]);
    expect(selected).toEqual(images.slice(0, 2).reverse().map((i) => `${base}/api/public/sites/v1/media/${i.id}.jpg`));
  });

  it("does not send a confidential image even if requested in the gallery", async () => {
    const sign = vi.fn();
    const db = { storage: { from: () => ({ createSignedUrl: sign }) } } as never;
    await expect(directHomedirectImages(db, [`${base}/api/public/sites/v1/media/${images[2].id}.jpg`], images, property, null)).rejects.toThrow("Nu s-au putut pregăti fotografiile");
    expect(sign).not.toHaveBeenCalled();
  });
});