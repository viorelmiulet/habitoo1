import { expect, it } from "vitest";
import settingsSource from "./app.settings.tsx?raw";

it("Setări nu mai randează cardul separat de promovări Imobiliare.ro", () => {
  expect(settingsSource).not.toContain("ImobiliarePromotionsAdminCard");
  expect(settingsSource).toContain("<ImoradarAutoCard");
});
