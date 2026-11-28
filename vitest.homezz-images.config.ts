import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: { include: ["src/lib/portals/homezz/images.test.ts", "src/lib/portals/homezz/publish.test.ts"], testTimeout: 15000 },
});