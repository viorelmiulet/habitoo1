import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: {
    environment: "node",
    include: [
      "tests/partner-api-admin.test.ts",
      "tests/partner-api-sandbox-sql.test.ts",
      "src/lib/agency-stats-scope.test.ts",
      "src/lib/portal-organizations.operational.test.ts",
      "src/lib/user-deletion.test.ts",
      "src/lib/public-agencies-selection.test.ts",
      "src/components/superadmin/AgencyStatsTable.sa2.test.tsx",
      "src/components/superadmin/AgencyAdminActions.sandbox.test.tsx",
      "src/routes/_authenticated/superadmin.agencies.operational.test.tsx",
    ],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
