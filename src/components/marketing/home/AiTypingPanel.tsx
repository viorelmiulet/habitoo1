import { useEffect, useState } from "react";
import { Check, Sparkles } from "lucide-react";

/** Texte demonstrative pentru panoul AI din hero (date fictive). */
const DEMOS = [
  {
    label: "AI Marketing · descriere anunț",
    text: "Apartament luminos cu 3 camere, 78 mp utili, la 5 minute de metrou. Bucătărie separată, balcon închis și loc de parcare inclus.",
    action: "Aprobă descrierea",
  },
  {
    label: "AI CRM · follow-up propus",
    text: "Clientul a văzut 2 proprietăți săptămâna trecută. Propun un apel mâine la 10:00, cu încă o ofertă din aceeași zonă și același buget.",
    action: "Programează follow-up",
  },
] as const;

/**
 * Panou AI care „scrie” un text. SSR afișează textul complet; animația pornește
 * doar după hidratare și nu rulează cu prefers-reduced-motion.
 */
export function AiTypingPanel() {
  const [demo, setDemo] = useState(0);
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let index = 0;
    let chars = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const full = DEMOS[index]!.text.length;
      if (chars < full) {
        chars += 2;
        setShown(chars);
        timer = setTimeout(tick, 28);
      } else {
        timer = setTimeout(() => {
          index = (index + 1) % DEMOS.length;
          chars = 0;
          setDemo(index);
          setShown(0);
          tick();
        }, 3200);
      }
    };
    setShown(0);
    timer = setTimeout(tick, 600);
    return () => clearTimeout(timer);
  }, []);

  const current = DEMOS[demo]!;
  const visible = shown === null ? current.text : current.text.slice(0, shown);
  const done = shown === null || shown >= current.text.length;

  return (
    <div className="hp-ai-panel w-[min(20rem,calc(100vw-3rem))] rounded-2xl border border-gold/30 bg-card p-4 text-left text-card-foreground shadow-float">
      <div className="flex items-center gap-2 text-xs font-semibold text-gold-dark">
        <span className="grid size-6 place-items-center rounded-full bg-gold-tint">
          <Sparkles className="size-3.5" aria-hidden />
        </span>
        {current.label}
      </div>
      <p className="mt-3 min-h-[6.5rem] text-sm leading-relaxed text-foreground" aria-live="off">
        {visible}
        {!done ? <span aria-hidden className="hp-caret" /> : null}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-[11px] text-muted-foreground">AI-ul propune, tu aprobi</span>
        <span className={done ? "inline-flex items-center gap-1 rounded-full bg-navy px-3 py-1 text-[11px] font-semibold text-navy-foreground" : "inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-[11px] font-semibold text-muted-foreground"}>
          <Check className="size-3" aria-hidden /> {current.action}
        </span>
      </div>
    </div>
  );
}
