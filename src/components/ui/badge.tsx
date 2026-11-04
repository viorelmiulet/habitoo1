import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-navy text-primary-foreground",
        secondary: "border-transparent bg-neutral-foreground text-neutral",
        destructive: "border-transparent bg-danger-tint text-destructive",
        outline: "border-border text-foreground",
        success: "border-transparent bg-success-foreground text-success",
        warning: "border-transparent bg-gold-tint text-warning-text",
        info: "border-transparent bg-info-foreground text-info",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
