import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}>
      {children}
    </div>
  );
}

export function Eyebrow({
  children,
  className,
  tone = "primary",
}: {
  children: ReactNode;
  className?: string;
  tone?: "primary" | "gold" | "light";
}) {
  const tones = {
    primary: "border-primary/20 bg-primary/8 text-primary",
    gold: "border-gold/30 bg-gold/10 text-gold",
    light: "border-navy-foreground/15 bg-navy-foreground/8 text-navy-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide uppercase",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  text,
  align = "center",
  tone = "default",
  className,
  as: Tag = "h2",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  text?: ReactNode;
  align?: "center" | "left";
  tone?: "default" | "light";
  className?: string;
  as?: "h1" | "h2" | "h3";
}) {
  const light = tone === "light";
  return (
    <div
      className={cn(
        "max-w-3xl",
        align === "center" ? "mx-auto text-center" : "text-left",
        className,
      )}
    >
      {eyebrow ? (
        <Eyebrow tone={light ? "light" : "primary"} className="mb-4">
          {eyebrow}
        </Eyebrow>
      ) : null}
      <Tag
        className={cn(
          "text-3xl font-semibold tracking-tight text-balance sm:text-4xl",
          Tag === "h1" && "text-4xl sm:text-5xl lg:text-6xl",
          light ? "text-navy-foreground" : "text-navy",
        )}
      >
        {title}
      </Tag>
      {text ? (
        <p
          className={cn(
            "mt-4 text-base text-pretty sm:text-lg",
            light ? "text-navy-muted" : "text-muted-foreground",
          )}
        >
          {text}
        </p>
      ) : null}
    </div>
  );
}

export function Section({
  id,
  children,
  className,
  tone = "default",
}: {
  id?: string;
  children: ReactNode;
  className?: string;
  tone?: "default" | "muted" | "navy";
}) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-24 py-16 sm:py-20 lg:py-28",
        tone === "muted" && "border-y border-border bg-muted/40",
        tone === "navy" && "mk-navy-bg",
        className,
      )}
    >
      {children}
    </section>
  );
}
