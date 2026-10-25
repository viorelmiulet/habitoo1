import { defineConfig } from "vitest/config";

// Exercise authenticated handlers without the server-function RPC transform.
export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: { environment: "node", include: ["src/lib/private-listings-*.handler-test.ts"] },
});