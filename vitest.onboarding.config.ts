import { defineConfig } from "vitest/config";
export default defineConfig({ resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } }, test: { environment: "jsdom", include: ["src/components/app/OnboardingTour.test.tsx", "src/components/app/OnboardingTour.context.test.tsx", "src/lib/onboarding-tour.test.ts"] } });
