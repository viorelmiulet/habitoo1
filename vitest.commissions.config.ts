import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: {
    environment: "node",
    include: [
      "src/lib/commissions.test.ts",
      "src/lib/commissions-reports.test.ts",
      "src/lib/commissions-rates.test.ts",
      "src/lib/commissions-export.test.ts",
    ],
  },
});
