import type { ComponentProps } from "react";
import { InvalidHintsContext, useFormInvalidHints } from "@/lib/form-invalid-hints";

/** `<form>` care afișează erorile native de validare prin starea React (vezi form-invalid-hints). */
export function HintedForm({ children, ...props }: ComponentProps<"form">) {
  const { hints, handlers } = useFormInvalidHints();
  return (
    <form {...props} {...handlers}>
      <InvalidHintsContext.Provider value={hints}>{children}</InvalidHintsContext.Provider>
    </form>
  );
}

export function InvalidHintText({ message }: { message: string | undefined }) {
  if (!message) return null;
  return <p className="mt-1 text-[13px] text-destructive">{message}</p>;
}
