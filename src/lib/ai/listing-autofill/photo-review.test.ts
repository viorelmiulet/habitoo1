import { describe, expect, it, vi } from "vitest";
import { confirmedPhotoOrder, validatePhotoReview } from "./photo-review";
import { generatePhotoReview } from "./photo-review.server";
import type { AIProvider } from "@/lib/ai/providers/types";
const raw = { photos: [{ index: 0, category: "bathroom", issues: ["dark", "person"], duplicate_of: null }, { index: 1, category: "living", issues: ["blurry", "plate", "document"], duplicate_of: null }, { index: 2, category: "kitchen", issues: ["duplicate"], duplicate_of: 1 }] };
describe("analiza fotografiilor, fără modificări automate", () => {
  it("ordinea living/bucătărie/camere/baie/balcon/exterior/plan este deterministă", () => {
    const categories = ["plan", "exterior", "balcony", "bathroom", "bedroom", "kitchen", "living"];
    const review = validatePhotoReview({ photos: categories.map((category, index) => ({ index, category, issues: [], duplicate_of: null })) }, categories);
    expect(review?.order).toEqual(["living", "kitchen", "bedroom", "bathroom", "balcony", "exterior", "plan"]);
  });
  it("semnalările au motive și duplicatul referă altă fotografie", () => {
    const review = validatePhotoReview(raw, ["a", "b", "c"]);
    expect(review?.photos.map((p) => p.reasons)).toEqual([["Fotografie întunecată", "Persoană vizibilă"], ["Fotografie neclară", "Număr de înmatriculare vizibil", "Document vizibil"], ["Fotografie duplicată (poza 2)"]]);
  });
  it("ordonarea necesită confirmare și păstrează inclusiv fotografiile noi/neanalizate", () => {
    const ids = ["a", "b", "c", "new"];
    expect(confirmedPhotoOrder(ids, ["b", "c", "a"], false)).toEqual(ids);
    expect(confirmedPhotoOrder(ids, ["b", "c", "a"], true)).toEqual(["b", "c", "a", "new"]);
  });
  it("referințele necunoscute și duplicatele de indici nu pot altera galeria", () => {
    expect(validatePhotoReview({ photos: [...raw.photos, raw.photos[0]] }, ["a", "b", "c", "d"])).toBeNull();
    expect(confirmedPhotoOrder(["a", "b"], ["a", "external"], true)).toEqual(["a", "b"]);
  });
  it("răspunsul invalid nu este aplicabil; AI-ul este simulat", async () => {
    const provider: AIProvider = { id: "mock", model: "mock", supportsTools: false, generate: vi.fn(async () => ({ text: "not JSON", toolCalls: [], inputTokens: null, outputTokens: null })) };
    await expect(generatePhotoReview(provider, ["a"], [{ mimeType: "image/jpeg", base64: "aA==" }])).rejects.toThrow("formatul");
  });
});