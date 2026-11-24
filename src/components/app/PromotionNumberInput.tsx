/** Numeric promotion input that keeps the typed text locally so 0 can be cleared. */
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

export function sanitizePromotionDigits(raw: string, max?: number | null): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return "";
  const value = Number(digits);
  return typeof max === "number" && value > max ? String(max) : String(value);
}

export function PromotionNumberInput({ value, max, onValue, ...rest }: {
  value: number;
  max?: number | null;
  onValue: (value: number) => void;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    setText((current) => (current === "" && value === 0 && focused ? "" : String(value)));
  }, [value, focused]);
  return (
    <Input
      {...rest}
      type="text"
      inputMode="numeric"
      placeholder="0"
      value={text}
      onFocus={(event) => { setFocused(true); event.currentTarget.select(); }}
      onBlur={() => { setFocused(false); if (text === "") setText("0"); }}
      onChange={(event) => {
        const next = sanitizePromotionDigits(event.target.value, max);
        setText(next);
        onValue(next === "" ? 0 : Number(next));
      }}
    />
  );
}
