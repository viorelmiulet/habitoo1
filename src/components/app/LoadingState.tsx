import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Rânduri de listă (tabel-like) în curs de încărcare. */
export function ListSkeleton({
  rows = 6,
  className,
  compact = false,
}: {
  rows?: number;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("divide-y divide-border", className)} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Se încarcă…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={cn("flex items-center gap-4 px-4", compact ? "py-2.5" : "py-3.5")}>
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-[min(60%,16rem)]" />
            <Skeleton className="h-3 w-[min(40%,10rem)]" />
          </div>
          <Skeleton className="hidden h-5 w-16 rounded-full sm:block" />
          <Skeleton className="hidden h-3 w-20 md:block" />
        </div>
      ))}
    </div>
  );
}

/** Grilă de carduri în curs de încărcare. */
export function CardGridSkeleton({
  count = 6,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3", className)} role="status" aria-busy="true">
      <span className="sr-only">Se încarcă…</span>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="panel overflow-hidden">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** KPI-uri în curs de încărcare. */
export function KpiSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)} role="status" aria-busy="true">
      <span className="sr-only">Se încarcă…</span>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="panel p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="size-10 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Bloc generic (detaliu / formular) în curs de încărcare. */
export function DetailSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-6", className)} role="status" aria-busy="true">
      <span className="sr-only">Se încarcă…</span>
      <div className="space-y-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-[min(70%,28rem)]" />
        <Skeleton className="h-4 w-[min(50%,20rem)]" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel space-y-3 p-5 lg:col-span-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="mt-4 h-40 w-full rounded-xl" />
        </div>
        <div className="panel space-y-3 p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      </div>
    </div>
  );
}

/** Text de încărcare mic, inline (pentru zone compacte). */
export function InlineLoading({ label = "Se încarcă…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground", className)} role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
      {label}
    </div>
  );
}

/** Ecran de încărcare pentru shell-ul autentificat (înainte de a ști utilizatorul). */
export function ShellLoading({ label = "Se încarcă…" }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background" role="status" aria-busy="true">
      <div className="flex flex-col items-center gap-3">
        <span className="size-8 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" />
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
