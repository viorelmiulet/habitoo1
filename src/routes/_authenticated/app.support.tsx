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
import { StatusBadge } from "@/components/app/StatusBadge";
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
          description="Ai o problemă, o întrebare sau o idee? Deschide un tichet și echipa Habitoo îți răspunde direct în aplicație."
          action={
            <SupportWidget>
              <Button>
                <LifeBuoy className="mr-2 size-4" />
                Deschide tichet
              </Button>
            </SupportWidget>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <ul className="space-y-2">
            {(tickets.data ?? []).map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSelected(t.id)}
                  className={cn(
                    "w-full rounded-xl border bg-surface px-4 py-3.5 text-left transition-colors hover:border-primary/40",
                    selected === t.id ? "border-primary/60 ring-1 ring-primary/30" : "border-border",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{t.subject}</span>
                    <SupportStatusBadge status={t.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge tone="neutral">
                      {SUPPORT_CATEGORY_LABELS[t.category] ?? t.category}
                    </StatusBadge>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(t.lastMessageAt)}
                    </span>
                    {t.lastReplyByStaff ? (
                      <span className="text-xs font-medium text-primary">Răspuns suport</span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    Deschis de {t.createdByName ?? "—"}
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
