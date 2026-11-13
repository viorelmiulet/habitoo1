/** Cardul „Grad de completare” (formular și fișă). Prezentare doar. */
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { CompletenessItem, CompletenessKey, CompletenessResult } from "@/lib/property-completeness";

export function completenessTargetId(key: CompletenessKey, idPrefix: string, isLand: boolean): string | null {
  switch (key) {
    case "title": return "title";
    case "description": return "description";
    case "sale_price": return `${idPrefix}-sale-price`;
    case "rent_price": return `${idPrefix}-rent-price`;
    case "city": return `${idPrefix}-locality`;
    case "surface": return `${idPrefix}-${isLand ? "land_surface" : "usable_surface"}`;
    case "rooms": return `${idPrefix}-rooms`;
    case "energy_class": return `${idPrefix}-energy_class`;
    case "coords": return `${idPrefix}-location-precise`;
    case "agent": return "responsible-agent";
    default: return null;
  }
}

export function focusCompletenessTarget(id: string | null) {
  if (!id) return;
  const el = document.getElementById(id) ?? document.querySelector<HTMLElement>(`[data-completeness="${id}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => (el as HTMLElement).focus?.({ preventScroll: true }), 300);
}

function Ring({ percent, size }: { percent: number; size: number }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${percent}% completat`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-muted" strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-primary" strokeWidth={6} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-foreground text-sm font-bold">{percent}%</text>
    </svg>
  );
}

function Group({ title, items, onItem }: { title: string; items: CompletenessItem[]; onItem: (k: CompletenessKey) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i.key}>
            <button type="button" onClick={() => onItem(i.key)} className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-sm hover:bg-muted">
              {i.done
                ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-success" aria-label="completat" />
                : <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-muted-foreground/50" aria-label="necompletat" />}
              <span className={i.done ? "text-muted-foreground" : ""}>{i.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PropertyCompletenessCard({ result, onItem, compact = false }: {
  result: CompletenessResult; onItem: (key: CompletenessKey) => void; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const body = (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Ring percent={result.percent} size={compact ? 52 : 68} />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{result.done} din {result.total} completate</p>
          <p className="truncate text-xs text-muted-foreground">{result.label}</p>
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${result.percent}%` }} /></div>
      <Group title="Obligatorii la publicare" items={result.required} onItem={onItem} />
      <Group title="Recomandate" items={result.recommended} onItem={onItem} />
    </div>
  );
  return (
    <section className="panel p-4" aria-label="Grad de completare">
      <h2 className="mb-3 hidden font-sans text-base font-bold lg:block">Grad de completare</h2>
      <button type="button" className="flex w-full items-center justify-between gap-2 lg:hidden" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="text-sm font-semibold">Grad de completare · {result.percent}%</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">{result.done}/{result.total}<ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} /></span>
      </button>
      <div className={`${open ? "mt-3 block" : "hidden"} lg:mt-0 lg:block`}>{body}</div>
    </section>
  );
}
