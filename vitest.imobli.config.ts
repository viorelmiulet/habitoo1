import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: {
    environment: "node",
    include: ["src/lib/portals/**/*.test.ts", "src/lib/portals*.test.ts", "src/lib/site-feed/**/*.test.ts"],
    testTimeout: 15000,
  },
});