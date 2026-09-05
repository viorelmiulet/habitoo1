import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "./Section";
import { Reveal } from "./Reveal";
import { CrmLink } from "./CrmLink";

export function CtaBand({
  title = "Transformă modul în care lucrezi cu clienții și proprietățile.",
  text = "Creează agenția în câteva minute, invită echipa și începe să lucrezi dintr-un singur sistem: portofoliu, clienți, cereri, lead-uri, matching și rapoarte.",
  primaryLabel = "Creează agenția",
  secondaryLabel = "Solicită o demonstrație",
}: {
  title?: string;
  text?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
}) {
  return (
    <section className="py-16 sm:py-20 lg:py-24">
      <Container>
        <Reveal>
          <div className="mk-navy-bg relative overflow-hidden rounded-3xl px-6 py-14 text-center shadow-float sm:px-12 lg:px-20 lg:py-20">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 right-0 size-72 rounded-full bg-gold/20 blur-3xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-24 left-0 size-72 rounded-full bg-primary/30 blur-3xl"
            />
            <div className="relative mx-auto max-w-3xl">
              <h2 className="text-3xl font-semibold tracking-tight text-balance text-navy-foreground sm:text-4xl lg:text-5xl">
                {title}
              </h2>
              <p className="mt-5 text-base text-pretty text-navy-muted sm:text-lg">{text}</p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="h-12 bg-gold px-7 text-base text-gold-foreground hover:bg-gold/90"
                >
                  <CrmLink to="/register">
                    {primaryLabel} <ArrowRight />
                  </CrmLink>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 border-navy-foreground/25 bg-transparent px-7 text-base text-navy-foreground hover:bg-navy-foreground/10 hover:text-navy-foreground"
                >
                  <Link to="/contact" search={{ interes: "demo" }}>
                    {secondaryLabel}
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
