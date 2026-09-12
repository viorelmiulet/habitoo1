/**
 * TUR GHIDAT INTERACTIV.
 *
 * Overlay semi-transparent cu decupaj peste elementul real din interfață și o
 * casetă explicativă lângă el. Overlay-ul nu captează click-uri: utilizatorul
 * poate naviga manual în timpul turului, iar turul continuă de unde a rămas
 * (sau afișează pasul centrat, fără evidențiere, dacă elementul nu există).
 *
 * Declanșare: automat o singură dată (flag `profiles.onboarding_tour_seen_at`)
 * și manual, oricând, din butonul „Ghid” din bara de sus.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { currentUserQueryKey, type CurrentUser } from "@/hooks/use-session";
import { tourStepsFor } from "@/lib/onboarding-tour";
import { cn } from "@/lib/utils";

type TourApi = { start: () => void; available: boolean };

const TourContext = createContext<TourApi>({ start: () => {}, available: false });

export function useOnboardingTour() {
  return useContext(TourContext);
}

/** Cheie locală: evită repornirea automată înainte ca flagul să ajungă pe server. */
const AUTOSTART_KEY = "habitoo.tour.autostart.v1";

type Rect = { top: number; left: number; width: number; height: number };

const CARD_WIDTH = 328;

export function OnboardingTourProvider({
  user,
  children,
}: {
  user: CurrentUser;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();

  const available =
    !user.isSuperadmin && (user.role === "agent" || user.role === "agency_admin") && !!user.profile;
  const steps = useMemo(
    () => tourStepsFor(user.role === "agency_admin" ? "agency_admin" : "agent"),
    [user.role],
  );

  const [index, setIndex] = useState<number | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [searching, setSearching] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [cardSize, setCardSize] = useState({ width: CARD_WIDTH, height: 200 });
  const cardRef = useRef<HTMLDivElement | null>(null);
  const scrolledFor = useRef<string | null>(null);

  useEffect(() => setMounted(true), []);

  const step = index === null ? null : (steps[index] ?? null);

  const markSeen = useCallback(async () => {
    if (!user.profile || user.impersonation) return;
    try {
      await supabase
        .from("profiles")
        .update({ onboarding_tour_seen_at: new Date().toISOString() })
        .eq("id", user.userId);
      await queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
    } catch {
      // Turul nu trebuie să deranjeze niciodată utilizatorul dacă salvarea eșuează.
    }
  }, [queryClient, user.impersonation, user.profile, user.userId]);

  const close = useCallback(() => {
    setIndex(null);
    setRect(null);
    void markSeen();
  }, [markSeen]);

  const start = useCallback(() => {
    scrolledFor.current = null;
    setRect(null);
    setIndex(0);
  }, []);

  // Pornire automată, o singură dată, pentru utilizatorii noi.
  useEffect(() => {
    if (!available || user.impersonation) return;
    if (user.profile?.onboarding_tour_seen_at) return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(AUTOSTART_KEY) === user.userId) return;
    window.localStorage.setItem(AUTOSTART_KEY, user.userId);
    const t = window.setTimeout(() => start(), 900);
    return () => window.clearTimeout(t);
  }, [available, start, user.impersonation, user.profile?.onboarding_tour_seen_at, user.userId]);

  // Navigare automată la ruta pasului curent.
  useEffect(() => {
    if (!step?.route) return;
    if (pathname === step.route) return;
    void navigate({ to: step.route as never });
  }, [navigate, pathname, step?.route]);

  // Urmărirea elementului evidențiat (apariție întârziată, scroll, resize).
  useEffect(() => {
    if (!step) return;
    const selectors = step.selectors ?? [];
    if (selectors.length === 0) {
      setRect(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const startedAt = Date.now();
    let found = false;

    const tick = () => {
      const el = document.querySelector<HTMLElement>(selectors.join(","));
      if (!el) {
        if (!found && Date.now() - startedAt > 2500) {
          setSearching(false);
          setRect(null);
        }
        return;
      }
      found = true;
      setSearching(false);
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      if (scrolledFor.current !== step.id) {
        scrolledFor.current = step.id;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [step]);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCardSize({ width: r.width, height: r.height });
  }, [index, rect]);

  const goNext = useCallback(() => {
    setIndex((i) => {
      if (i === null) return null;
      if (i + 1 >= steps.length) {
        void markSeen();
        setRect(null);
        return null;
      }
      setRect(null);
      return i + 1;
    });
  }, [markSeen, steps.length]);

  const goBack = useCallback(() => {
    setIndex((i) => (i === null || i === 0 ? i : i - 1));
    setRect(null);
  }, []);

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, goBack, goNext, index]);

  const api = useMemo<TourApi>(() => ({ start, available }), [available, start]);

  let overlay: React.ReactNode = null;
  if (mounted && step) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(CARD_WIDTH, vw - 24);
    const highlight = rect && !searching ? rect : null;

    let cardStyle: React.CSSProperties;
    if (highlight) {
      const below = vh - (highlight.top + highlight.height) > cardSize.height + 24;
      const top = below
        ? highlight.top + highlight.height + 12
        : Math.max(12, highlight.top - cardSize.height - 12);
      const left = Math.min(
        Math.max(12, highlight.left + highlight.width / 2 - width / 2),
        Math.max(12, vw - width - 12),
      );
      cardStyle = { top, left, width };
    } else {
      cardStyle = {
        top: Math.max(12, vh / 2 - cardSize.height / 2),
        left: Math.max(12, vw / 2 - width / 2),
        width,
      };
    }

    overlay = createPortal(
      <div className="pointer-events-none fixed inset-0 z-[120]" aria-hidden={false}>
        {highlight ? (
          <div
            className="absolute rounded-xl ring-2 ring-gold transition-all duration-200"
            style={{
              top: highlight.top - 6,
              left: highlight.left - 6,
              width: highlight.width + 12,
              height: highlight.height + 12,
              boxShadow: "0 0 0 9999px oklch(0.2 0.03 248 / 0.55)",
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-[oklch(0.2_0.03_248_/_0.55)]" />
        )}

        <div
          ref={cardRef}
          role="dialog"
          aria-label={step.title}
          className={cn(
            "panel pointer-events-auto absolute space-y-3 p-4 shadow-xl",
            "transition-[top,left] duration-200",
          )}
          style={cardStyle}
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold tracking-wide text-gold uppercase">
                Pasul {(index ?? 0) + 1} din {steps.length}
              </p>
              <h2 className="mt-0.5 text-sm font-semibold">{step.title}</h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="-mt-1 -mr-1 size-7 shrink-0"
              aria-label="Închide turul"
              onClick={close}
            >
              <X className="size-4" />
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">{step.text}</p>
          {!highlight && step.fallbackNote ? (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              {step.fallbackNote}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={close}>
              Sări peste
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goBack} disabled={index === 0}>
                Înapoi
              </Button>
              <Button size="sm" onClick={goNext}>
                {index !== null && index + 1 >= steps.length ? "Am înțeles" : "Înainte"}
              </Button>
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <TourContext.Provider value={api}>
      {children}
      {overlay}
    </TourContext.Provider>
  );
}
