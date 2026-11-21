import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { ComparisonLinkPath } from "@/lib/marketing/comparison-content";

/** Feature pages are a dynamic route; other targets are static public routes. */
export function ComparisonLink({ to, className, children }: { to: ComparisonLinkPath; className?: string; children: ReactNode }) {
  if (to.startsWith("/functionalitati/")) {
    return <Link to="/functionalitati/$slug" params={{ slug: to.slice("/functionalitati/".length) }} className={className}>{children}</Link>;
  }
  return <Link to={to as Exclude<ComparisonLinkPath, `/functionalitati/${string}`>} className={className}>{children}</Link>;
}
