import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: { environment: "node", include: ["src/lib/contracts/c6.test.ts", "src/lib/contracts/c5.test.ts", "src/lib/contracts/id/scan.test.ts"], testTimeout: 15000 },
});
