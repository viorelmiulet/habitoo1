import * as React from "react";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const MAX_VIEWPORT_HEIGHT_RATIO = 0.7;

function fitTextareaToContent(element: HTMLTextAreaElement) {
  element.style.height = "auto";

  const minimumHeight = Number.parseFloat(window.getComputedStyle(element).minHeight) || 0;
  const maximumHeight = window.innerHeight * MAX_VIEWPORT_HEIGHT_RATIO;
  const nextHeight = Math.min(Math.max(element.scrollHeight, minimumHeight), maximumHeight);

  element.style.height = `${nextHeight}px`;
  element.style.overflowY = element.scrollHeight > maximumHeight ? "auto" : "hidden";
}

const PropertyDescriptionTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<typeof Textarea>
>(({ className, onChange, value, ...props }, forwardedRef) => {
  const localRef = React.useRef<HTMLTextAreaElement | null>(null);

  const setRef = React.useCallback(
    (element: HTMLTextAreaElement | null) => {
      localRef.current = element;
      if (typeof forwardedRef === "function") forwardedRef(element);
      else if (forwardedRef) forwardedRef.current = element;
    },
    [forwardedRef],
  );

  React.useLayoutEffect(() => {
    const element = localRef.current;
    if (element) fitTextareaToContent(element);
  }, [value]);

  React.useEffect(() => {
    const handleResize = () => {
      const element = localRef.current;
      if (element) fitTextareaToContent(element);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <Textarea
      {...props}
      ref={setRef}
      value={value}
      onChange={(event) => {
        fitTextareaToContent(event.currentTarget);
        onChange?.(event);
      }}
      className={cn(
        "min-h-[260px] max-w-full resize-y overflow-x-hidden sm:min-h-[330px]",
        className,
      )}
    />
  );
});

PropertyDescriptionTextarea.displayName = "PropertyDescriptionTextarea";

export { PropertyDescriptionTextarea };