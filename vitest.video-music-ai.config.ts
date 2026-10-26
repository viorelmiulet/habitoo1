import { defineConfig } from "vitest/config";

// Exercise the authenticated handler without the server-function RPC transform.
export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: { environment: "node", include: ["src/lib/video-music-ai.handler-test.ts"] },
});
