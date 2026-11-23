import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: { environment: "node", include: ["src/lib/ai/lead-assist/*.test.ts", "src/lib/daily-brief/tests/lead-qualification.test.ts", "src/lib/daily-brief/tests/lead-score-scope.test.ts", "src/lib/daily-brief/tests/data-scope.test.ts", "src/components/app/ai/LeadAiAssist.test.tsx"], testTimeout: 15000 },
});