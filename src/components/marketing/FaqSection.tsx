import { Plus } from "lucide-react";
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
        <div className="mt-10 space-y-3">
          {items.map((item) => (
            <details key={item.q} className="ds-card group px-5 sm:px-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left [&::-webkit-details-marker]:hidden">
                <h3 className="text-base font-semibold text-navy">{item.q}</h3>
                <Plus aria-hidden className="size-4 shrink-0 ds-ai transition-transform group-open:rotate-45 motion-reduce:transition-none" />
              </summary>
              <p className="pb-5 text-[15px] leading-relaxed text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </Section>
  );
}