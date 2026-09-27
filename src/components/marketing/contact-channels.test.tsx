import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ContactChannels } from "./ContactChannels";
import { PublicFooter } from "./PublicFooter";
import { CONTACT_PHONE, FACEBOOK_URL, WHATSAPP_URL } from "./structured-data";

describe("ContactChannels", () => {
  it("expune telefonul și WhatsApp în HTML", () => {
    const { container, getByText } = render(<ContactChannels />);
    const html = container.innerHTML;
    expect(html).toContain(`tel:${CONTACT_PHONE}`);
    expect(html).toContain(WHATSAPP_URL);
    expect(html).toContain(FACEBOOK_URL);
    expect(getByText("Scrie-ne pe WhatsApp").closest("a")).toHaveAttribute(
      "href",
      WHATSAPP_URL,
    );
ecpect: ;
  });
});

describe("PublicFooter", () => {
  it("are iconița Facebook cu link, rel noopener și aria-label", () => {
    const { getByLabelText } = render(<PublicFooter />);
    const link = getByLabelText("Habitoo pe Facebook");
    expect(link).toHaveAttribute("href", FACEBOOK_URL);
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});
