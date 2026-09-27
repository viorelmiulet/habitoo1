import { ChevronDown } from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/marketing/Section";

export type FaqItem = {
  q: string;
  a: string;
};

export function faqPageJsonLd(items: readonly FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };
}

type FaqSectionProps = {
  items: readonly FaqItem[];
  title?: string;
};

export function FaqSection({ items, title = "Ce ne întreabă de obicei agențiile" }: FaqSectionProps) {
  return (
    <Section>
      <Container className="max-w-3xl">
        <SectionHeading eyebrow="Întrebări frecvente" title={title} />
        <div className="mt-10 divide-y divide-border border-y border-border">
          {items.map((item) => (
            <details key={item.q} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left [&::-webkit-details-marker]:hidden">
                <h3 className="text-base font-semibold text-navy">{item.q}</h3>
                <ChevronDown
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                />
              </summary>
              <p className="pb-5 text-base leading-relaxed text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </Section>
  );
}