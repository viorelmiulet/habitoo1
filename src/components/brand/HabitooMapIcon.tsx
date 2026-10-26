import type { SVGProps } from "react";

/** Habitoo's original linear map-and-home mark. */
export function HabitooMapIcon({ className = "size-4 shrink-0 text-primary", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
      <path d="m7.5 10 4.5-4 4.5 4M8.8 9v6h6.4V9M11 15v-3h2v3" />
    </svg>
  );
}