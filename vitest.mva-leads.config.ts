import { defineConfig } from 'vitest/config';
export default defineConfig({ resolve: { alias: { '@': new URL('./src',import.meta.url).pathname } }, test: { environment: 'node', include: ['src/lib/portals/mvaimobiliare/lead-tokens.test.ts','src/lib/portals/mvaimobiliare/api.test.ts','src/lib/portals/mvaimobiliare/core.test.ts'], testTimeout: 15000 } });
