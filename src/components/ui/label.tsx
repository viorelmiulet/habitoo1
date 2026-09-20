"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const labelVariants = cva(
  "text-sm font-semibold leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:text-faint",
);

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn(labelVariants(), className)} {...props} />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };

export function FieldHint(props: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p {...props} className={cn("text-xs text-muted-foreground", props.className)} />;
}

export function FieldError(props: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      role="alert"
      {...props}
      className={cn("text-xs font-semibold text-destructive", props.className)}
    />
  );
}
