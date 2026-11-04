import * as React from "react";

import { cn } from "@/lib/utils";
import { useInvalidHint } from "@/lib/form-invalid-hints";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    const hint = useInvalidHint(props.id);
    const field = (
      <textarea
        className={cn(
          "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          hint && "border-input-error",
          className,
        )}
        ref={ref}
        {...props}
        aria-invalid={hint ? true : props["aria-invalid"]}
      />
    );
    if (!hint) return field;
    return (
      <>
        {field}
        <p className="mt-1 text-[13px] text-destructive">{hint}</p>
      </>
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
