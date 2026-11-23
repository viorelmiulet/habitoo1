import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: { environment: "node", include: ["src/lib/ai/client-assist/*.test.ts", "src/components/app/ai/ClientAiPanel.test.tsx"], testTimeout: 15000 },
});