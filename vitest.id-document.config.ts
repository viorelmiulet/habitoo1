import { defineConfig } from "vitest/config";

// Test the authenticated ID-reading handler without the server RPC transform.
export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: {
    environment: "node",
    include: ["src/lib/contracts/id/*test.ts", "src/lib/ai/tests/minimax.test.ts"],
  },
});