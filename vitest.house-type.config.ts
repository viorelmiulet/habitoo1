import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: {
    include: ["src/components/app/PropertyDetailsFields.house-type.test.tsx", "src/lib/portals/house-type.test.ts"],
    testTimeout: 15000,
  },
});