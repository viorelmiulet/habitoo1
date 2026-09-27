import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FaqSection, faqPageJsonLd, type FaqItem } from "./FaqSection";

const items: FaqItem[] = [
  { q: "Prima întrebare?", a: "Primul răspuns." },
  { q: "A doua întrebare?", a: "Al doilea răspuns." },
];

describe("FAQ server rendering", () => {
  it("includes every question as h3 and every answer in server HTML", () => {
    const html = renderToStaticMarkup(<FaqSection items={items} />);

    expect(html).toContain("<h3");
    expect(html.match(/<h3/g)).toHaveLength(2);
    for (const item of items) {
      expect(html).toContain(item.q);
      expect(html).toContain(item.a);
    }
  });

  it("produces valid FAQPage JSON-LD from the visible items", () => {
    const schema = faqPageJsonLd(items);
    const parsed = JSON.parse(JSON.stringify(schema));

    expect(parsed["@type"]).toBe("FAQPage");
    expect(parsed.mainEntity).toHaveLength(2);
    expect(parsed.mainEntity.map((entity: { name: string }) => entity.name)).toEqual(
      items.map((item) => item.q),
    );
    expect(
      parsed.mainEntity.map((entity: { acceptedAnswer: { text: string } }) =>
        entity.acceptedAnswer.text,
      ),
    ).toEqual(items.map((item) => item.a));
  });
});