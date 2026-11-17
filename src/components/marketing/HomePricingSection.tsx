import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PLAN_AGENT_LIMITS, PLAN_LABELS, PLAN_PRICES, type PlanKey } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { CrmLink } from "./CrmLink";
import { LaunchOfferBadge } from "./LaunchOfferBadge";
import { navyButton } from "./PublicHeader";
import { Container, Section, SectionHeading } from "./Section";

const keys: PlanKey[] = ["basic", "pro", "unlimited"];

export function HomePricingSection() {
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");

  return (
    <Section id="preturi" className="bg-background">
      <Container>
        <SectionHeading eyebrow="Prețuri" title="Prețuri simple, fără surprize" />
        <LaunchOfferBadge className="mt-8" />
        <div className="mt-8 flex justify-center">
          <div role="group" aria-label="Perioada de plată" className="inline-flex items-center gap-1 rounded-[14px] border border-border bg-muted p-1">
            {(["monthly", "annual"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={cycle === value}
                onClick={() => setCycle(value)}
                className={cn(
                  "min-h-11 px-4 text-sm font-semibold",
                  cycle === value ? "bg-[color:var(--ds-cyan)] text-[#04131A] hover:bg-[color:var(--ds-cyan)] hover:text-[#04131A]" : "text-muted-foreground",
                )}
              >
                {value === "monthly" ? "Lunar" : "Anual · -50%"}
              </Button>
            ))}
          </div>
        </div>
        <div className="mt-9 grid min-w-0 gap-5 md:grid-cols-3">
          {keys.map((key) => {
            const featured = key === "pro";
            const price = PLAN_PRICES[key];
            return (
              <div
                key={key}
                className={cn(
                  "relative flex min-w-0 flex-col rounded-[28px] border p-6 transition-transform duration-300 hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                  featured ? "ds-card border-[color:var(--ds-cyan)] shadow-[0_30px_90px_-40px_rgba(91,228,255,0.45)]" : "ds-card",
                )}
              >
                {featured ? <span className="absolute top-6 right-6 rounded-full bg-[color:var(--ds-cyan)] px-2.5 py-1 font-mono text-[10px] font-medium tracking-wider text-[#04131A] uppercase">Recomandat</span> : null}
                <h3 className={cn("text-xl font-semibold", featured ? "text-navy-foreground" : "text-navy")}>{PLAN_LABELS[key]}</h3>
                <p className={cn("mt-5 flex items-baseline gap-1.5 text-5xl font-bold font-display tracking-[-0.04em]", featured ? "text-navy-foreground" : "text-navy")}>
                  {cycle === "annual" ? price.annualMonthly : price.monthly} €
                  <span className={cn("text-base font-medium", featured ? "text-navy-muted" : "text-muted-foreground")}>/lună</span>
                </p>
                <p className={cn("mt-2 text-sm", featured ? "text-navy-muted" : "text-muted-foreground")}>
                  {cycle === "annual" ? `Facturat anual, ${price.annualMonthly * 12} €/an` : "Facturat lunar"}
                </p>
                <p className={cn("mt-6 text-sm font-medium", featured ? "text-navy-foreground" : "text-foreground")}>
                  {key === "unlimited" ? "agenți fără limită" : `până la ${PLAN_AGENT_LIMITS[key]} agenți`}
                </p>
                <p className={cn("mt-2 text-sm", "ds-ai")}>90 de zile gratuit, fără card bancar</p>
                <p className={cn("mt-2 inline-flex items-center gap-1.5 text-sm font-semibold", featured ? "text-gold" : "text-gold-dark")}>
                  <Sparkles className="size-4 ds-ai" aria-hidden /> Habitoo AI inclus
                </p>
              </div>
            );
          })}
        </div>
        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild variant="outline" className="ds-btn ds-btn-ghost w-full sm:w-auto">
            <Link to="/preturi">Vezi toate detaliile</Link>
          </Button>
          <Button asChild className={cn(navyButton, "w-full sm:w-auto")}>
            <CrmLink to="/register">Începe acum <ArrowRight /></CrmLink>
          </Button>
        </div>
      </Container>
    </Section>
  );
}