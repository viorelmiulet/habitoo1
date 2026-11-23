import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["src/lib/portals/lacheie/tests/image-limit.test.ts", "src/lib/portals/lacheie/tests/image-limit-recovery.test.ts", "src/lib/portals/lacheie/tests/image-limit-adapter.test.ts", "src/lib/portals/lacheie/tests/mapper.test.ts"],
    testTimeout: 15000,
  },
});