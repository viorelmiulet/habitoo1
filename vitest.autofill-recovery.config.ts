import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: { environment: "node", include: ["src/lib/ai/listing-autofill/ai19-recovery.test.ts", "src/lib/ai/credits/stale-refund.test.ts", "src/lib/ai/listing-autofill/ai17-depth.test.ts"], testTimeout: 15000 },
});