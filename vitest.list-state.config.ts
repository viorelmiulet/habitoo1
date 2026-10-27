import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: { environment: "node", include: ["src/lib/search-places.test.ts", "src/lib/list-state.test.ts", "src/lib/list-page-size.test.ts", "src/lib/property-list-filters.test.ts"] },
});