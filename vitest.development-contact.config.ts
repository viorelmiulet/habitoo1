import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: { include: ['src/lib/developments/contact.test.ts', 'src/lib/portals/storia/investment-readiness-functions.test.ts', 'src/components/app/developments/DevelopmentPublishing.test.tsx'], testTimeout: 15000, hookTimeout: 15000 },
});
