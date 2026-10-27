import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Compass, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CurrentUser } from "@/hooks/use-session";
import { useAiFeatures } from "@/hooks/use-ai-features";
import { GUIDE_CONTEXT_EVENT, accessibleGuides, acceptsGuideInput, canShowAutomatically, guideForPath, guidePathMatches, guidesForContext, implementedGuides, stepsForUser, type GuideDefinition, type GuideId, type TourStep } from "@/lib/onboarding-tour";
import { claimGuide, finishGuide, getGuideProgress, setGuideAutoStart } from "@/lib/onboarding.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { plannedGuides } from "@/lib/onboarding-catalog";

type TourApi = { start: () => void; openLibrary: () => void; available: boolean; hasCurrent: boolean };
const TourContext = createContext<TourApi>({ start: () => {}, openLibrary: () => {}, available: false, hasCurrent: false });
export function useOnboardingTour() { return useContext(TourContext); }

type Rect = { top: number; left: number; width: number; height: number };
function visibleTarget(selector?: string): HTMLElement | null {
  if (!selector) return null;
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find((el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0) ?? null;
}

export function OnboardingTourProvider({ user, children, openMenu, closeMenu }: {
  user: CurrentUser; children: React.ReactNode; openMenu: () => void; closeMenu: () => void;
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const load = useServerFn(getGuideProgress);
  const claim = useServerFn(claimGuide);
  const finish = useServerFn(finishGuide);
  const saveAuto = useServerFn(setGuideAutoStart);
  const { features } = useAiFeatures();
  const key = useMemo(() => ["onboarding-guides", user.userId], [user.userId]);
  const available = !!user.profile && !user.impersonation;
  const state = useQuery({ queryKey: key, queryFn: () => load(), enabled: available, staleTime: 0, refetchOnWindowFocus: true });
  const guides = useMemo(() => accessibleGuides(implementedGuides, user.role, features), [user.role, features]);
  const planned = plannedGuides.filter((g) => g.roles.includes(user.role) && (!g.feature || features[g.feature]));
  const [contextKey, setContextKey] = useState<string | null>(null);
  useEffect(() => {
    const handler = (event: Event) => setContextKey((event as CustomEvent<string>).detail);
    window.addEventListener(GUIDE_CONTEXT_EVENT, handler);
    return () => window.removeEventListener(GUIDE_CONTEXT_EVENT, handler);
  }, []);
  useEffect(() => { setContextKey(null); }, [pathname]);
  const contextGuides = useMemo(() => guidesForContext(pathname, contextKey), [pathname, contextKey]);
  const current = contextGuides[0] ?? guideForPath(pathname);
  const [active, setActive] = useState<GuideDefinition | null>(null);
  const [index, setIndex] = useState(0);
  const [library, setLibrary] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [hint, setHint] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [ready, setReady] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewport, setViewport] = useState({ width: 1280, height: 800 });
  const [cardHeight, setCardHeight] = useState(260);
  const cardRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  const run = useRef(0);
  const starting = useRef(false);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSteps = useMemo(() => (active ? stepsForUser(active, user.role, features) : []), [active, user.role, features]);
  const step = activeSteps[index];
  activeRef.current = active;

  useEffect(() => {
    setReady(true);
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    resize(); window.addEventListener("resize", resize);
    return () => { window.removeEventListener("resize", resize); if (transitionTimer.current) clearTimeout(transitionTimer.current); };
  }, []);
  useEffect(() => {
    setActive(null); setLibrary(false); run.current++;
  }, [user.userId]);

  const remember = useCallback((id: string, status: "seen" | "skipped" | "completed") => {
    queryClient.setQueryData(key, (old: Awaited<ReturnType<typeof load>> | undefined) => {
      const progress = old?.progress ?? [];
      const previous = progress.find((p) => p.guide_id === id);
      return { autoStart: old?.autoStart ?? true, progress: [...progress.filter((p) => p.guide_id !== id), { guide_id: id, status: previous?.status === "completed" ? "completed" : status }] };
    });
  }, [key, load, queryClient]);
  const close = useCallback((completed = false) => {
    const guide = activeRef.current;
    run.current++; setActive(null); setRect(null); setConfirmation(""); closeMenu();
    if (!guide) return;
    remember(guide.id, completed ? "completed" : "skipped");
    void finish({ data: { guideId: guide.id as GuideId, completed } }).then(() => queryClient.invalidateQueries({ queryKey: key })).catch(() => toast.error("Progresul nu s-a salvat. Poți relua ghidul din Ghid."));
  }, [closeMenu, finish, key, queryClient, remember]);
  const launch = useCallback((guide: GuideDefinition) => {
    run.current++; setIndex(0); setRect(null); setLibrary(false); setActive(guide);
  }, []);
  const next = useCallback(() => {
    setConfirmation("");
    if (index + 1 >= activeSteps.length) close(true);
    else { setIndex(index + 1); setRect(null); }
  }, [activeSteps.length, close, index]);
  const completeInteraction = useCallback(() => {
    if (!step || confirmation) return;
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    setConfirmation(step.confirmation ?? "Gata, ai făcut pasul.");
    const generation = run.current;
    transitionTimer.current = setTimeout(() => { if (run.current === generation) next(); }, 850);
  }, [confirmation, next, step]);

  useEffect(() => {
    if (!available || !state.data || active || library || starting.current || !current || !guides.some((g) => g.id === current.id)) return;
    if (!canShowAutomatically(state.data.autoStart, state.data.progress, current.id)) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      starting.current = true;
      try {
        const claimed = await claim({ data: { guideId: current.id as GuideId } });
        if (claimed) { remember(current.id, "seen"); if (!cancelled && !activeRef.current) launch(current); }
        else void queryClient.invalidateQueries({ queryKey: key });
      } catch { /* A failed read/claim never blocks normal work. */ }
      finally { starting.current = false; }
    }, 650);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [active, available, claim, current, guides, key, launch, library, queryClient, remember, state.data]);

  // Navigating deliberately leaves the guide; a final click to the next guide completes it.
  useEffect(() => {
    if (!active || pathname.replace(/\/$/, "") === active.path) return;
    const last = active.steps[index];
    close(index === active.steps.length - 1 && last?.event === "click");
  }, [active, close, index, pathname]);

  useEffect(() => {
    setHint(false); setShowDone(false); setConfirmation("");
    if (!step) return;
    const timer = step.mode === "do" ? setTimeout(() => setHint(true), 20_000) : undefined;
    return () => { if (timer) clearTimeout(timer); if (transitionTimer.current) clearTimeout(transitionTimer.current); };
  }, [step]);

  useEffect(() => {
    if (!step || !ready) return;
    let scrolled = false;
    const sync = () => {
      const target = visibleTarget(step.selector);
      if (!target) { setRect(null); return; }
      let r = target.getBoundingClientRect();
      const mobile = window.innerWidth < 768;
      const safeBottom = window.innerHeight - (mobile ? cardHeight + 32 : 16);
      if ((!scrolled || (mobile && r.height < 180)) && (r.top < 80 || Math.min(r.bottom, r.top + 160) > safeBottom)) {
        const targetY = Math.max(88, (safeBottom - Math.min(r.height,180)) / 2);
        window.scrollBy({ top: r.top - targetY, behavior: "instant" });
        scrolled = true;
        r = target.getBoundingClientRect();
      }
      // Large sections highlight their heading, not an entire scrollable page.
      setRect({ top: r.top, left: r.left, width: r.width, height: Math.min(r.height, 160) });
    };
    sync(); const timer = setInterval(sync, 150);
    return () => clearInterval(timer);
  }, [cardHeight, ready, step]);
  useEffect(() => {
    if (!cardRef.current) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setCardHeight(entry.contentRect.height + 32); });
    observer.observe(cardRef.current); return () => observer.disconnect();
  }, [step]);
  useEffect(() => {
    if (!active || viewport.width >= 768) return;
    const main = document.getElementById("continut");
    if (!main) return;
    const previous = main.style.paddingBottom;
    main.style.paddingBottom = `${cardHeight + viewport.height / 2}px`;
    return () => { main.style.paddingBottom = previous; };
  }, [active, cardHeight, viewport.height, viewport.width]);
  useEffect(() => {
    if (step?.mode !== "do") return;
    const listener = (event: Event) => {
      const target = visibleTarget(step.selector);
      if (!target || !(event.target instanceof Node) || !target.contains(event.target)) return;
      if (step.event === "input" && (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) || !acceptsGuideInput(event.target.value))) return;
      completeInteraction();
    };
    const event = step.event ?? "click";
    document.addEventListener(event, listener, true);
    return () => document.removeEventListener(event, listener, true);
  }, [completeInteraction, step]);
  useEffect(() => {
    if (!active) return;
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); close(false); } };
    document.addEventListener("keydown", handler, true); return () => document.removeEventListener("keydown", handler, true);
  }, [active, close]);

  const show = (s: TourStep) => {
    if (!s.show) return;
    if (s.show === "menu") { if (window.innerWidth < 1024) openMenu(); }
    else if (["portfolio", "clients", "management"].includes(s.show)) {
      const group = s.show === "portfolio" ? "Portofoliu" : s.show === "clients" ? "Clienți" : "Management";
      const el = visibleTarget(`[data-tour="group:${group}"]`);
      if (el?.getAttribute("aria-expanded") === "false") el.click();
    } else {
      closeMenu();
      const selectors = { filters: '[data-tour="properties-filters-toggle"]', publish: '[data-tour="properties-view-publish"]', details: '[data-tour="new-details"]' };
      const selector = selectors[s.show as keyof typeof selectors];
      const el = visibleTarget(selector);
      if (el && el.getAttribute("aria-expanded") !== "true" && el.getAttribute("aria-pressed") !== "true" && el.getAttribute("data-state") !== "open") el.click();
    }
    setShowDone(true);
  };
  useEffect(() => {
    if (step?.id === "portfolio" && active?.id === "first-steps") {
      const el = visibleTarget('[data-tour="group:Portofoliu"]');
      if (el?.getAttribute("aria-expanded") === "true") el.click();
    }
    if (active?.id === "first-steps" && step?.id === "help") closeMenu();
  }, [active?.id, closeMenu, step]);
  const toggleAuto = async (enabled: boolean) => {
    setSaving(true);
    try { await saveAuto({ data: { enabled } }); queryClient.setQueryData(key, (old: Awaited<ReturnType<typeof load>> | undefined) => ({ autoStart: enabled, progress: old?.progress ?? [] })); }
    catch { toast.error("Setarea nu s-a salvat. Încearcă din nou."); }
    finally { setSaving(false); }
  };
  const api = { available, hasCurrent: !!current && guides.some((g) => g.id === current.id), start: () => { if (current && guides.some((g) => g.id === current.id)) launch(current); else setLibrary(true); }, openLibrary: () => { if (active) close(false); setLibrary(true); } };
  const mobile = viewport.width < 768;
  const width = Math.min(360, viewport.width - 24);
  const left = mobile ? 12 : Math.max(12, Math.min(viewport.width-width-12, rect ? rect.left + rect.width/2-width/2 : viewport.width/2-width/2));
  const below = rect ? rect.top + rect.height + 16 : viewport.height/2-cardHeight/2;
  const top = Math.max(12, Math.min(viewport.height-cardHeight-12, rect && below+cardHeight>viewport.height ? rect.top-cardHeight-16 : below));
  const completed = state.data?.progress.filter((p) => p.status === "completed" && guides.some((g) => g.id === p.guide_id)).length ?? 0;
  return <TourContext.Provider value={api}>
    {children}
    <Dialog open={library} onOpenChange={setLibrary}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Ghidurile tale</DialogTitle><DialogDescription>{completed} din {guides.length} ghiduri disponibile terminate</DialogDescription></DialogHeader>
        <div className="flex items-center justify-between gap-4 border-y border-border py-3"><label htmlFor="guide-auto" className="text-sm">Pornește ghidurile automat</label><Switch id="guide-auto" checked={state.data?.autoStart ?? true} onCheckedChange={(v) => void toggleAuto(v)} disabled={saving || !state.data} /></div>
        {state.isError ? <p role="alert" className="text-sm text-destructive">Progresul nu a putut fi încărcat. Poți relua ghidurile manual.</p> : null}
        {Array.from(new Set(guides.map((g) => g.group))).map((group) => <section key={group}><h3 className="mb-2 text-sm font-semibold text-muted-foreground">{group}</h3><div className="space-y-1">{guides.filter((g) => g.group === group).map((g) => <Button key={g.id} variant="ghost" className="h-auto min-h-11 w-full justify-between whitespace-normal text-left" onClick={() => { if (current?.id === g.id) launch(g); else { setLibrary(false); void navigate({ to: g.path as never }).then(() => launch(g)); } }}><span>{g.title}</span>{state.data?.progress.some((p) => p.guide_id === g.id && p.status === "completed") ? <Check className="size-4 text-success" aria-label="Terminat" /> : <Compass className="size-4 text-muted-foreground" />}</Button>)}</div></section>)}
        <details className="border-t border-border pt-3"><summary className="cursor-pointer text-sm font-semibold">Ghiduri pentru etapele următoare ({planned.length})</summary><div className="mt-3 space-y-4">{Array.from(new Set(planned.map((g) => g.group))).map((group) => <section key={group}><h3 className="text-sm font-semibold">{group}</h3><ul className="mt-2 space-y-2">{planned.filter((g) => g.group === group).map((g) => <li key={g.id} className="text-sm text-muted-foreground"><span>{g.title}</span><p className="text-xs">{g.trigger}</p></li>)}</ul></section>)}</div></details>
      </DialogContent>
    </Dialog>
    {ready && step ? createPortal(<div className="pointer-events-none fixed inset-0 z-(--z-guide)">
      {rect ? <div className="guide-highlight absolute rounded-lg ring-2 ring-gold" style={{ top: rect.top-5, left: rect.left-5, width: rect.width+10, height: rect.height+10 }} /> : <div className="absolute inset-0 bg-sidebar/50" />}
      <div ref={cardRef} role="dialog" aria-label={step.title} aria-live="polite" data-guide={active?.id} data-guide-step={step.id} className={cn("pointer-events-auto fixed space-y-3 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-xl", mobile && "max-h-[55dvh] overflow-y-auto")} style={mobile ? { bottom: 12, left, width } : { top, left, width }}>
        <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-gold-dark">{active?.title} · {index+1}/{active?.steps.length}</p><h2 className="mt-1 text-base font-semibold">{step.title}</h2></div><Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Închide ghidul" onClick={() => close(false)}><X className="size-4" /></Button></div>
        <p className="text-sm text-muted-foreground">{step.text}</p>
        {!rect && step.selector ? <p className="text-xs text-muted-foreground">{step.fallbackNote ?? "Elementul nu este vizibil acum. Îl poți căuta în pagină sau poți sări pasul."}</p> : null}
        {confirmation ? <p role="status" className="text-sm font-medium text-success">{confirmation}</p> : null}
        {hint && !confirmation ? <p className="border-l-2 border-gold pl-3 text-xs text-muted-foreground">{step.hint ?? "Folosește elementul evidențiat sau sari pasul."}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-2"><Button variant="ghost" size="sm" onClick={() => close(false)}>Sari peste</Button><div className="flex gap-1"><Button variant="outline" size="sm" disabled={index===0} onClick={() => setIndex(index-1)}>Înapoi</Button>{step.mode === "show" && !showDone ? <Button size="sm" onClick={() => show(step)}>Arată-mi</Button> : <Button size="sm" onClick={next} disabled={!!confirmation}>{step.mode === "do" ? "Sari pasul" : index+1 === active?.steps.length ? "Am înțeles" : "Înainte"}</Button>}</div></div>
        <Button variant="link" size="sm" className="h-auto whitespace-normal p-0 text-xs" disabled={saving} onClick={() => void toggleAuto(!(state.data?.autoStart ?? true))}>{state.data?.autoStart === false ? "Reactivează ghidurile automate" : "Nu mai porni ghidurile automat"}</Button>
      </div>
    </div>, document.body) : null}
  </TourContext.Provider>;
}
