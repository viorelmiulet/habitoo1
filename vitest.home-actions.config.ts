import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({resolve:{alias:{'@':path.resolve(__dirname,'src')}},test:{include:['src/lib/daily-brief/brief.test.ts','src/lib/daily-brief/actions.test.ts','src/lib/daily-brief/tests/*.test.ts','src/lib/portals/failure-notification.test.ts'],testTimeout:15000}});
