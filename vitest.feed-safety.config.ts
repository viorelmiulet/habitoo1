import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: {alias: {"@": new URL("./src", import.meta.url).pathname}},
  test: {environment: "node", include: ["src/lib/site-feed/**/*.test.ts", "tests/xml-feed-safety.test.ts"], testTimeout: 15000},
});