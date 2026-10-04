import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
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
    <Section aria-label="Prețuri" id="preturi" className="bg-background">
      <Container>
        <SectionHeading title="Prețuri simple, fără surprize" />
        <LaunchOfferBadge className="mt-8" />
        <div className="mt-8 flex justify-center">
          <div role="group" aria-label="Perioada de plată" className="inline-flex items-center gap-1 rounded-full border border-border bg-muted p-1">
            {(["monthly", "annual"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={cycle === value}
                onClick={() => setCycle(value)}
                className={cn(
                  "h-9 rounded-full px-4 text-xs sm:text-sm",
                  cycle === value ? "bg-navy text-navy-foreground hover:bg-navy hover:text-navy-foreground" : "text-muted-foreground",
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
                  "relative flex min-w-0 flex-col rounded-3xl border p-6",
                  featured ? "mk-navy-bg border-navy shadow-float" : "border-border bg-card shadow-soft",
                )}
              >
                {featured ? <span className="absolute -top-3 left-6 rounded-full bg-gold px-3 py-1 text-xs font-semibold text-gold-foreground">Recomandat</span> : null}
                <h3 className={cn("text-xl font-semibold", featured ? "text-navy-foreground" : "text-navy")}>{PLAN_LABELS[key]}</h3>
                <p className={cn("mt-5 flex items-baseline gap-1.5 text-4xl font-semibold", featured ? "text-navy-foreground" : "text-navy")}>
                  {cycle === "annual" ? price.annualMonthly : price.monthly} €
                  <span className={cn("text-base font-medium", featured ? "text-navy-muted" : "text-muted-foreground")}>/lună</span>
                </p>
                <p className={cn("mt-2 text-sm", featured ? "text-navy-muted" : "text-muted-foreground")}>
                  {cycle === "annual" ? `Facturat anual, ${price.annualMonthly * 12} €/an` : "Facturat lunar"}
                </p>
                <p className={cn("mt-6 text-sm font-medium", featured ? "text-navy-foreground" : "text-foreground")}>
                  {key === "unlimited" ? "agenți fără limită" : `până la ${PLAN_AGENT_LIMITS[key]} agenți`}
                </p>
                <p className={cn("mt-2 text-sm", featured ? "text-navy-foreground" : "text-success")}>30 de zile gratuit, fără card bancar</p>
              </div>
            );
          })}
        </div>
        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild variant="outline" className="w-full sm:w-auto">
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