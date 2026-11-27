import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: { include: ['src/lib/operational-agency-stats.server.test.ts', 'src/components/superadmin/PortalOrgSelector.operational.test.tsx', 'src/lib/superadmin-status.operational.test.ts', 'src/lib/portal-organizations.operational.test.ts', 'src/components/superadmin/AgencyStatsTable.sa2.test.tsx', 'src/routes/_authenticated/superadmin.agencies.operational.test.tsx'], testTimeout: 15000, hookTimeout: 15000 },
});
