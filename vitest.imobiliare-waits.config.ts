import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({ resolve: { alias: { "@": path.resolve(__dirname, "src") } }, test: { include: ["src/lib/portals/imobiliare/tests/stuck-waits.test.ts"], testTimeout: 15000 } });
