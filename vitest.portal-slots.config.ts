import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: {
    environment: "jsdom",
    include: ["src/components/app/PortalSlotsCard.test.tsx", "src/components/superadmin/PortalsCard.slots.test.tsx", "src/routes/_authenticated/-superadmin-portal-settings.test.ts"],
    testTimeout: 15000,
  },
});