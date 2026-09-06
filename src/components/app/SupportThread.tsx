/**
 * Firul de conversație al unui tichet de suport.
 * `staff` activează opțiunile de Superadmin: notiță internă + schimbare status.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Lock, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { toastError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  getSupportTicket,
  replySupportTicketAsStaff,
  replyToSupportTicket,
  setSupportTicketStatus,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_STATUS_LABELS,
  type SupportStatus,
} from "@/lib/support.functions";
import { toast } from "sonner";

export function SupportStatusBadge({ status }: { status: SupportStatus }) {
  const tone: Record<SupportStatus, string> = {
    open: "border-primary/40 bg-primary/10 text-primary",
    in_progress: "border-warning/40 bg-warning/15 text-warning-foreground",
    resolved: "border-success/40 bg-success/10 text-success",
    closed: "border-border bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", tone[status])}>
      {SUPPORT_STATUS_LABELS[status]}
    </span>
  );
}

export function SupportThread({ ticketId, staff = false }: { ticketId: string; staff?: boolean }) {
  const qc = useQueryClient();
  const load = useServerFn(getSupportTicket);
  const replyUser = useServerFn(replyToSupportTicket);
  const replyStaff = useServerFn(replySupportTicketAsStaff);
  const changeStatus = useServerFn(setSupportTicketStatus);

  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);

  const ticket = useQuery({
    queryKey: ["support-ticket", ticketId],
    queryFn: () => load({ data: { ticketId } }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["support-ticket", ticketId] });
    void qc.invalidateQueries({ queryKey: ["support-tickets"] });
    void qc.invalidateQueries({ queryKey: ["support-unresolved"] });
    void qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const send = useMutation({
    mutationFn: async () => {
      const text = body.trim();
      if (text.length < 2) throw new Error("Scrie un mesaj înainte de a trimite.");
      if (staff) await replyStaff({ data: { ticketId, body: text, isInternalNote: internal } });
      else await replyUser({ data: { ticketId, body: text } });
    },
    onSuccess: () => {
      setBody("");
      setInternal(false);
      invalidate();
      toast.success("Mesaj trimis.");
    },
    onError: (e) => toastError(e),
  });

  const status = useMutation({
    mutationFn: (next: SupportStatus) => changeStatus({ data: { ticketId, status: next } }),
    onSuccess: () => {
      invalidate();
      toast.success("Status actualizat.");
    },
    onError: (e) => toastError(e),
  });

  if (ticket.isLoading) return <InlineLoading label="Se încarcă tichetul…" />;
  if (ticket.error) return <QueryError error={ticket.error} onRetry={() => void ticket.refetch()} />;
  if (!ticket.data) return null;
  const t = ticket.data;

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
            {SUPPORT_CATEGORY_LABELS[t.category] ?? t.category}
            {staff && t.organizationName ? ` · ${t.organizationName}` : ""}
          </p>
          <h3 className="truncate text-base font-semibold">{t.subject}</h3>
          <p className="text-xs text-muted-foreground">
            Deschis de {t.createdByName ?? "utilizator"} · {formatDateTime(t.createdAt)}
            {staff && t.contextPath ? ` · pagina: ${t.contextPath}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SupportStatusBadge status={t.status} />
          {staff ? (
            <Select value={t.status} onValueChange={(v) => status.mutate(v as SupportStatus)}>
              <SelectTrigger className="h-8 w-40" aria-label="Schimbă statusul">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["open", "in_progress", "resolved", "closed"] as SupportStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {SUPPORT_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </div>

      <ol className="space-y-3">
        {t.messages.map((m) => (
          <li
            key={m.id}
            className={cn(
              "rounded-lg border px-3 py-2.5 text-sm",
              m.isInternalNote
                ? "border-warning/40 bg-warning/10"
                : m.isStaff
                  ? "border-gold/30 bg-gold/5"
                  : "border-border bg-muted/40",
            )}
          >
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              {m.isInternalNote ? <Lock className="size-3" /> : m.isStaff ? <ShieldCheck className="size-3" /> : null}
              {m.isInternalNote ? "Notiță internă" : m.isStaff ? "Suport Habitoo" : (m.senderName ?? "Utilizator")}
              <span className="font-normal">· {formatDateTime(m.createdAt)}</span>
            </p>
            <p className="whitespace-pre-wrap">{m.body}</p>
          </li>
        ))}
      </ol>

      {t.canReply || staff ? (
        <div className="space-y-2">
          <Label htmlFor={`reply-${ticketId}`}>Răspuns</Label>
          <Textarea
            id={`reply-${ticketId}`}
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={staff ? "Răspunsul către agenție…" : "Scrie un mesaj pentru echipa de suport…"}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            {staff ? (
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={internal} onCheckedChange={setInternal} />
                Notiță internă (nevăzută de agenție)
              </label>
            ) : (
              <span />
            )}
            <Button onClick={() => send.mutate()} disabled={send.isPending}>
              {send.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Trimite
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Tichetul este închis. Deschide un tichet nou dacă mai ai nevoie de ajutor.
        </p>
      )}
    </div>
  );
}
