import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';
export default defineConfig({resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},test:{include:['src/lib/developments/unit-operations*.test.ts','src/components/app/developments/DevelopmentUnits.test.tsx'],testTimeout:15000,hookTimeout:15000}});