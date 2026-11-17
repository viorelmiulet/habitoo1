import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: { include: ["src/lib/ai/listing-autofill/photo-order.test.ts", "src/components/app/ai/ListingAutofillCard.test.tsx"] },
});