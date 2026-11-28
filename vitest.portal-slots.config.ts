import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: {
    environment: "jsdom",
    include: [
      "src/components/app/PortalSlotsCard.test.tsx",
      "src/components/app/ImobiliarePromotionsAdminCard.test.tsx",
      "src/components/app/ImopediaPackageBoostInfo.test.tsx",
      "src/components/superadmin/PortalsCard.slots.test.tsx",
      "src/lib/portals/imopedia/boost.functions.test.ts",
      "src/routes/_authenticated/-app-settings-promotions.test.ts",
      "src/routes/_authenticated/-superadmin-portal-settings.test.ts",
    ],
    testTimeout: 15000,
  },
});