import type { ReactNode } from "react";
import { PublicLayout } from "./PublicLayout";
import { Container, Eyebrow } from "./Section";

export type LegalSection = { title: string; body: ReactNode };

export function LegalPage({
  eyebrow,
  title,
  intro,
  lastUpdated,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  lastUpdated?: string;
  sections: LegalSection[];
}) {
  return (
    <PublicLayout>
      <section className="border-b border-border bg-card">
        <Container className="py-14 sm:py-16">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-navy sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground">{intro}</p>
          {lastUpdated ? (
            <p className="mt-3 text-sm font-medium text-muted-foreground">
              Ultima actualizare: {lastUpdated}
            </p>
          ) : null}
        </Container>
      </section>
      <Container className="grid gap-10 py-12 lg:grid-cols-12 lg:py-16">
        <nav aria-label="Cuprins" className="lg:col-span-3">
          <div className="lg:sticky lg:top-28">
            <p className="text-xs font-semibold tracking-wider text-navy uppercase">Cuprins</p>
            <ol className="mt-3 space-y-2">
              {sections.map((s, i) => (
                <li key={s.title}>
                  <a
                    href={`#sectiune-${i + 1}`}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {i + 1}. {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>
        <article className="max-w-[68ch] lg:col-span-9">
          <div className="space-y-12">
            {sections.map((s, i) => (
              <section key={s.title} id={`sectiune-${i + 1}`} className="scroll-mt-28">
                <h2 className="border-b border-border pb-2 text-xl font-semibold text-navy sm:text-2xl">
                  {i + 1}. {s.title}
                </h2>
                <div className="mt-4 space-y-4 text-[0.975rem] leading-7 text-muted-foreground [&_h3]:mt-6 [&_h3]:font-sans [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_strong]:font-semibold [&_strong]:text-foreground [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_th]:border [&_th]:border-border [&_th]:bg-card [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
                  {s.body}
                </div>
              </section>
            ))}
          </div>
        </article>
      </Container>
    </PublicLayout>
  );
}
