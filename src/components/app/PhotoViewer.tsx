import { useCallback, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/** Shared private photo viewer. The caller owns the open index and image order. */
export function PhotoViewer({ images, title, openAt, onOpenAtChange }: {
  images: { src: string | null; alt?: string | null }[];
  title: string;
  openAt: number | null;
  onOpenAtChange: (index: number | null) => void;
}) {
  const total = images.length;
  const start = useRef<{ x: number; y: number } | null>(null);
  const step = useCallback((delta: number) => {
    if (openAt === null || total < 2) return;
    onOpenAtChange((openAt + delta + total) % total);
  }, [openAt, total, onOpenAtChange]);
  useEffect(() => {
    if (openAt === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        step(event.key === "ArrowRight" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openAt, step]);
  const active = openAt === null ? null : images[openAt];
  return (
    <Dialog open={openAt !== null && total > 0} onOpenChange={open => { if (!open) onOpenAtChange(null); }}>
      <DialogContent
        className="max-w-5xl border-none bg-transparent p-0 shadow-none"
        aria-describedby={undefined}
        onEscapeKeyDown={event => event.stopPropagation()}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div className="relative touch-pan-y"
          onTouchStart={event => {
            const touch = event.touches[0];
            start.current = event.touches.length === 1 && touch ? { x: touch.clientX, y: touch.clientY } : null;
          }}
          onTouchCancel={() => { start.current = null; }}
          onTouchEnd={event => {
            const touch = event.changedTouches[0];
            const origin = start.current;
            start.current = null;
            if (!origin || !touch) return;
            const dx = touch.clientX - origin.x;
            const dy = touch.clientY - origin.y;
            if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
          }}
        >
          {active?.src ? <img src={active.src} alt={active.alt ?? title} draggable={false} className="max-h-[80vh] w-full rounded-2xl bg-background object-contain" /> : (
            <div className="flex h-72 w-full items-center justify-center rounded-2xl bg-muted text-muted-foreground"><ImageOff className="size-4" aria-hidden /></div>
          )}
          {total > 1 ? <>
            <Button type="button" variant="secondary" size="icon" onClick={() => step(-1)} aria-label="Fotografia anterioară" className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-background/85 text-foreground hover:bg-background"><ChevronLeft className="size-5" aria-hidden /></Button>
            <Button type="button" variant="secondary" size="icon" onClick={() => step(1)} aria-label="Fotografia următoare" className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-background/85 text-foreground hover:bg-background"><ChevronRight className="size-5" aria-hidden /></Button>
            <span aria-live="polite" className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-foreground/70 px-3 py-1 text-xs font-medium text-background">{(openAt ?? 0) + 1} / {total}</span>
          </> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}