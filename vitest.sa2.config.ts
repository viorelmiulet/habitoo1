import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/lib/agency-stats-scope.test.ts", "src/components/superadmin/AgencyStatsTable.sa2.test.tsx"], testTimeout: 15000, hookTimeout: 15000 },
});