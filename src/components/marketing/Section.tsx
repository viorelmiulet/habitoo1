import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PublicAnswer } from "./PublicAnswer";

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>
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
    primary: "ds-ai",
    gold: "text-gold",
    light: "ds-ai",
  };
  return (
    <span className={cn("ds-eyebrow inline-flex items-center gap-2 [&_svg]:hidden", tones[tone], className)}>
      <span aria-hidden>//</span>
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
          Tag === "h1" && "text-4xl sm:text-5xl",
          light ? "text-navy-foreground" : "text-navy",
        )}
      >
        {title}
      </Tag>
      {Tag === "h1" ? <PublicAnswer /> : null}
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
