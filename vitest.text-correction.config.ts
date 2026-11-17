import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: { environment: "node", include: ["src/lib/ai/text-correction/*.test.ts", "src/components/app/ai/TextCorrectionControl.test.tsx"] },
});