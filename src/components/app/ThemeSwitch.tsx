/** Comutator temă cu trei poziții (Luminos / Automat / Întunecat) din meniul lateral. */
import { Contrast as CircleHalf, Moon, SunMedium } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme, type ThemePreference } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

export const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Moon }[] = [
  { value: "light", label: "Luminos", icon: SunMedium },
  { value: "system", label: "Automat (după dispozitiv)", icon: CircleHalf },
  { value: "dark", label: "Întunecat", icon: Moon },
];

export function nextTheme(current: ThemePreference): ThemePreference {
  const i = THEME_OPTIONS.findIndex((o) => o.value === current);
  return THEME_OPTIONS[(i + 1) % THEME_OPTIONS.length]!.value;
}

export function ThemeSwitch({ collapsed = false }: { collapsed?: boolean }) {
  const { preference, setPreference } = useTheme();

  if (collapsed) {
    const active = THEME_OPTIONS.find((o) => o.value === preference) ?? THEME_OPTIONS[1]!;
    const next = THEME_OPTIONS.find((o) => o.value === nextTheme(preference))!;
    const Icon = active.icon;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setPreference(next.value)}
            aria-label={`Temă: ${active.label}. Treci la ${next.label}`}
            className="grid size-9 place-items-center rounded-full border border-sidebar-border bg-sidebar-accent/40 text-sidebar-primary transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
          >
            <Icon className="size-4" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Temă: {active.label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div role="radiogroup" aria-label="Temă" className="inline-flex items-center gap-0.5 rounded-full border border-sidebar-border bg-sidebar-accent/30 p-0.5">
      {THEME_OPTIONS.map((o) => {
        const on = preference === o.value;
        const Icon = o.icon;
        return (
          <Tooltip key={o.value}>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={o.label}
                onClick={() => setPreference(o.value)}
                className={cn(
                  "grid size-8 place-items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
                  on ? "bg-sidebar-foreground/15 text-sidebar-primary shadow-sm" : "text-sidebar-foreground/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{o.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
