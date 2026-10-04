import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomePricingSection } from "./HomePricingSection";
import { LAUNCH_OFFER, LaunchOfferBadge } from "./LaunchOfferBadge";

describe("prețurile publice", () => {
  it("nu arată oferta necompletată, dar afișează un text atunci când este furnizat", () => {
    expect(LAUNCH_OFFER).toBeNull();
    expect(renderToStaticMarkup(<LaunchOfferBadge />)).toBe("");
    expect(renderToStaticMarkup(<LaunchOfferBadge offer={{ text: "Text de probă" }} />)).toContain("Text de probă");
  });

  it("arată trei planuri și un singur comutator comun", () => {
    const html = renderToStaticMarkup(<HomePricingSection />);
    expect(html).toContain("Prețuri simple, fără surprize");
    expect(html.match(/aria-label="Perioada de plată"/g)).toHaveLength(1);
    expect(html).toContain("aria-pressed=\"true\">Lunar");
    expect(html).toContain("Anual · -50%");
    for (const name of ["Basic", "Pro", "Unlimited"]) expect(html).toContain(`>${name}</h3>`);
    expect(html).toContain("40 €");
    expect(html).not.toContain("OFERTĂ DE LANSARE");
  });
});