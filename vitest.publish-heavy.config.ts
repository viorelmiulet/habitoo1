import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({ resolve: { alias: { "@": path.resolve(__dirname, "src") } }, test: { include: ["src/lib/portals/tests/publish-heavy-serial.test.ts"], testTimeout: 15000 } });
