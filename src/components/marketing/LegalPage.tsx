import { Link } from "@tanstack/react-router";
import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PublicLayout } from "./PublicLayout";
import { Container, Eyebrow } from "./Section";

export type LegalSection = { title: string; body: ReactNode };

export function LegalPage({
  eyebrow,
  title,
  intro,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <PublicLayout>
      <section className="border-b border-border bg-card">
        <Container className="py-14 sm:py-16">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-navy sm:text-4xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground">{intro}</p>
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
        <article className="max-w-3xl lg:col-span-9">
          <Alert className="mb-8 border-info/30 bg-info/8">
            <Info className="size-4 text-info" />
            <AlertTitle>Document în curs de finalizare</AlertTitle>
            <AlertDescription>
              Versiunea completă a acestui document va fi publicată înainte de lansarea comercială.
              Textul de mai jos descrie principiile pe care le aplicăm deja. Pentru întrebări, folosește{" "}
              <Link to="/contact" className="font-medium text-primary underline-offset-4 hover:underline">
                pagina de contact
              </Link>
              .
            </AlertDescription>
          </Alert>
          <div className="space-y-10">
            {sections.map((s, i) => (
              <section key={s.title} id={`sectiune-${i + 1}`} className="scroll-mt-28">
                <h2 className="text-xl font-semibold text-navy">
                  {i + 1}. {s.title}
                </h2>
                <div className="mt-3 space-y-3 text-base leading-relaxed text-muted-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
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
