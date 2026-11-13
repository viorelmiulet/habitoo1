import { createContext, useContext } from "react";
import { Sparkles } from "lucide-react";

/** Câmpurile completate de AI și încă neconfirmate, pentru marcajul „AI”. */
export const AiFieldMarksContext = createContext<ReadonlySet<string>>(new Set());

export function AiMark({ field }: { field: string | string[] }) {
  const marks = useContext(AiFieldMarksContext);
  const fields = Array.isArray(field) ? field : [field];
  if (!fields.some((f) => marks.has(f))) return null;
  return (
    <span data-ai-mark={fields[0]} title="Completat de AI — verifică înainte de salvare" className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 align-middle text-[11px] font-semibold leading-none text-primary">
      <Sparkles className="size-3" aria-hidden="true" />AI
    </span>
  );
}
