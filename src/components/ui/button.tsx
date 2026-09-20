import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-sm font-bold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-transparent disabled:bg-control-disabled disabled:text-control-disabled-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-primary bg-primary text-primary-foreground hover:bg-gold-dark hover:text-surface",
        primary:
          "border border-primary bg-primary text-primary-foreground hover:bg-gold-dark hover:text-surface",
        destructive: "border border-danger-border bg-surface text-destructive hover:bg-danger-tint",
        danger: "border border-danger-border bg-surface text-destructive hover:bg-danger-tint",
        outline: "border border-input bg-surface text-foreground hover:bg-muted",
        secondary: "border border-input bg-surface text-foreground hover:bg-muted",
        soft: "border border-primary bg-gold-tint text-accent-foreground hover:bg-accent",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "h-auto text-gold-dark underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4",
        compact: "h-[38px] px-3 text-xs",
        sm: "h-[38px] px-3 text-xs",
        lg: "h-11 px-8",
        icon: "size-11 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

/** Un ecran folosește cel mult un singur Button primary/default. */

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
