import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';
export default defineConfig({resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},test:{include:['src/lib/developments.test.ts','src/components/app/developments/DevelopmentForm.test.tsx'],testTimeout:15000,hookTimeout:15000}});
