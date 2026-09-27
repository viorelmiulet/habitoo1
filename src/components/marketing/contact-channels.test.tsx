import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ContactChannels } from "./ContactChannels";
import { PublicFooter } from "./PublicFooter";
import { CONTACT_EMAIL, CONTACT_PHONE, FACEBOOK_URL, WHATSAPP_URL } from "./structured-data";

// Footerul folosește <Link>, care are nevoie de contextul routerului.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));


describe("ContactChannels", () => {
  it("expune telefonul și WhatsApp în HTML", () => {
    const html = renderToStaticMarkup(<ContactChannels />);
    expect(html).toContain(`tel:${CONTACT_PHONE}`);
    expect(html).toContain(WHATSAPP_URL);
    expect(html).toContain(FACEBOOK_URL);
    expect(html).toContain("Scrie-ne pe WhatsApp");
  });
});

describe("PublicFooter", () => {
  it("are iconița Facebook cu link, rel noopener și aria-label", () => {
    const html = renderToStaticMarkup(<PublicFooter />);
    expect(html).toContain(`href="${FACEBOOK_URL}"`);
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('aria-label="Habitoo pe Facebook"');
  });
});
