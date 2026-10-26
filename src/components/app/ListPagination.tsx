import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DEFAULT_LIST_PAGE_SIZE,
  LIST_PAGE_SIZES,
  normalizeListPageSize,
  pageNumbers,
  pageRangeLabel,
  type ListPageSize,
} from "@/lib/list-page-size";

const storageKey = (list: string, userId?: string | null) =>
  `habitoo.perPagina.v1.${list}${userId ? `.${userId}` : ""}`;

/**
 * Ține minte mărimea aleasă per utilizator și per listă. Dacă URL-ul nu are
 * `perPagina`, aplică valoarea salvată după montare (fără nepotriviri SSR).
 */
export function useRememberedPageSize(
  list: string,
  userId: string | null | undefined,
  urlValue: number | undefined,
  apply: (size: ListPageSize) => void,
) {
  const applied = useRef(false);
  useEffect(() => {
    if (urlValue !== undefined || applied.current || userId === undefined) return;
    applied.current = true;
    try {
      const saved = window.localStorage.getItem(storageKey(list, userId));
      if (saved === null) return;
      const size = normalizeListPageSize(saved);
      if (size !== DEFAULT_LIST_PAGE_SIZE) apply(size);
    } catch {
      /* localStorage indisponibil */
    }
  }, [list, userId, urlValue, apply]);
  return (size: ListPageSize) => {
    try {
      window.localStorage.setItem(storageKey(list, userId), String(size));
    } catch {
      /* localStorage indisponibil */
    }
  };
}

export function PageSizeSelect({ value, onChange }: { value: ListPageSize; onChange: (size: ListPageSize) => void }) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(normalizeListPageSize(v))}>
      <SelectTrigger aria-label="Anunțuri pe pagină" className="w-auto gap-2">
        <span className="shrink-0 text-muted-foreground">Anunțuri pe pagină:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LIST_PAGE_SIZES.map((size) => (
          <SelectItem key={size} value={String(size)}>{size}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PageRange({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  return <span>{pageRangeLabel(page, pageSize, total)}</span>;
}

/** Paginare numerotată cu Înapoi/Înainte; page este 1-based. */
export function ListPagination({ page, pages, onGo }: { page: number; pages: number; onGo: (page: number) => void }) {
  if (pages <= 1) return null;
  const go = (p: number) => {
    onGo(p);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <nav aria-label="Paginare" className="flex flex-wrap items-center justify-center gap-1">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => go(page - 1)} aria-label="Pagina anterioară">
        <ChevronLeft className="size-4" /> Înapoi
      </Button>
      {pageNumbers(page, pages).map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} className="px-1 text-muted-foreground">…</span>
        ) : (
          <Button
            key={p}
            variant={p === page ? "default" : "outline"}
            size="sm"
            className="min-w-9"
            aria-current={p === page ? "page" : undefined}
            onClick={() => go(p)}
          >
            {p}
          </Button>
        ),
      )}
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => go(page + 1)} aria-label="Pagina următoare">
        Înainte <ChevronRight className="size-4" />
      </Button>
    </nav>
  );
}
