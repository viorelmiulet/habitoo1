/**
 * „Tichetele mele”: un agent vede tichetele proprii, un administrator de
 * agenție vede toate tichetele agenției lui. Conversația continuă pe fir.
 */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LifeBuoy } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/app/PageHeader";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { EmptyState } from "@/components/app/EmptyState";
import { appHead } from "@/components/app/app-head";
import { SupportStatusBadge, SupportThread } from "@/components/app/SupportThread";
import { SupportWidget } from "@/components/app/SupportWidget";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { listMySupportTickets, SUPPORT_CATEGORY_LABELS } from "@/lib/support.functions";

export const Route = createFileRoute("/_authenticated/app/support")({
  validateSearch: z.object({ ticket: z.string().uuid().optional() }),
  head: () => appHead("Habitoo CRM — tichetele mele de suport"),
  component: MyTicketsPage,
});

function MyTicketsPage() {
  const { ticket: initial } = Route.useSearch();
  const [selected, setSelected] = useState<string | null>(initial ?? null);
  const load = useServerFn(listMySupportTickets);

  const tickets = useQuery({ queryKey: ["support-tickets", "mine"], queryFn: () => load({}) });

  return (
    <>
      <PageHeader
        title="Tichetele mele"
        description="Conversațiile cu echipa de suport Habitoo. Deschide un tichet nou din butonul de ajutor."
        actions={<SupportWidget />}
      />

      {tickets.isLoading ? (
        <InlineLoading label="Se încarcă tichetele…" />
      ) : tickets.error ? (
        <QueryError error={tickets.error} onRetry={() => void tickets.refetch()} />
      ) : (tickets.data ?? []).length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title="Nu ai tichete deschise"
          description="Folosește butonul de ajutor din bara de sus pentru a trimite o solicitare echipei Habitoo."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          <ul className="space-y-2">
            {(tickets.data ?? []).map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSelected(t.id)}
                  className={cn(
                    "w-full rounded-xl border bg-surface px-3 py-2.5 text-left transition-colors hover:border-primary/40",
                    selected === t.id ? "border-primary/60 ring-1 ring-primary/30" : "border-border",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{t.subject}</span>
                    <SupportStatusBadge status={t.status} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {SUPPORT_CATEGORY_LABELS[t.category] ?? t.category} · {t.createdByName ?? "—"} ·{" "}
                    {formatDateTime(t.lastMessageAt)}
                    {t.lastReplyByStaff ? " · răspuns suport" : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          <div>
            {selected ? (
              <SupportThread ticketId={selected} />
            ) : (
              <EmptyState
                icon={LifeBuoy}
                title="Selectează un tichet"
                description="Alege un tichet din listă pentru a vedea conversația."
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
