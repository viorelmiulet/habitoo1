import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HomePricingSection } from "./HomePricingSection";
import { LAUNCH_OFFER, LaunchOfferBadge } from "./LaunchOfferBadge";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

const OFFER_TEXT = "Profită de oferta de lansare";

describe("prețurile publice", () => {
  it("are textul final al ofertei de lansare, fără dată de final", () => {
    expect(LAUNCH_OFFER).toEqual({ text: OFFER_TEXT });
  });

  it("randează o singură linie cu textul ofertei și nimic când oferta este null", () => {
    const html = renderToStaticMarkup(<LaunchOfferBadge />);
    expect(html).toContain(OFFER_TEXT);
    expect(html).toContain("font-semibold");
    expect(html).not.toContain("OFERTĂ DE LANSARE");
    expect(html.match(new RegExp(OFFER_TEXT, "g"))).toHaveLength(1);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<button");
    expect(renderToStaticMarkup(<LaunchOfferBadge offer={null} />)).toBe("");
    expect(renderToStaticMarkup(<LaunchOfferBadge offer={{ text: "Text de probă" }} />)).toContain("Text de probă");
  });

  it("arată trei planuri, un singur comutator comun și oferta de lansare pe homepage", () => {
    const html = renderToStaticMarkup(<HomePricingSection />);
    expect(html).toContain("Prețuri simple, fără surprize");
    expect(html.match(/aria-label="Perioada de plată"/g)).toHaveLength(1);
    expect(html).toContain("aria-pressed=\"true\">Lunar");
    expect(html).toContain("Anual · -50%");
    for (const name of ["Basic", "Pro", "Unlimited"]) expect(html).toContain(`>${name}</h3>`);
    expect(html).toContain("40 €");
    expect(html).toContain(OFFER_TEXT);
    expect(html.match(new RegExp(OFFER_TEXT, "g"))).toHaveLength(1);
    expect(html).not.toContain("OFERTĂ DE LANSARE");
  });
});
