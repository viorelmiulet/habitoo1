import * as React from "react";

import { cn } from "@/lib/utils";
import { useInvalidHint } from "@/lib/form-invalid-hints";

export type InputProps = React.ComponentProps<"input"> & {
  error?: boolean;
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    const hint = useInvalidHint(props.id);
    const input = (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-control border border-input bg-surface px-3 py-2 text-base transition-colors file:border-0 file:bg-transparent file:text-sm file:font-semibold file:text-foreground placeholder:text-faint focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:bg-muted disabled:text-faint md:text-sm",
          (error || hint || props["aria-invalid"]) &&
            "border-input-error focus-visible:border-destructive focus-visible:ring-destructive/20",
          className,
        )}
        ref={ref}
        {...props}
        aria-invalid={hint ? true : props["aria-invalid"]}
      />
    );
    if (!hint) return input;
    return (
      <>
        {input}
        <p className="mt-1 text-[13px] text-destructive">{hint}</p>
      </>
    );
  },
);
Input.displayName = "Input";

export { Input };
