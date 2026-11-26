import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: { environment: "node", include: ["src/lib/site-feed/mva-activation.test.ts", "src/lib/portals/tests/agency-portal-setup.test.ts"], testTimeout: 15000 },
});