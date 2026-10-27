import { defineConfig } from "vitest/config";

// Run handler mocks without the application's server-function transport transform.
export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: {
    environment: "node",
    include: ["src/lib/neutral-offer.test.ts", "src/lib/offer-client.test.ts", "src/lib/partner-offers*.test.ts", "src/lib/public-offer.test.ts", "src/lib/collaboration-commission.test.ts"],
  },
});