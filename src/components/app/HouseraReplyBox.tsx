import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toastError } from "@/lib/errors";
import { getHouseraReplyState, retryHouseraLeadReply, sendHouseraLeadReply } from "@/lib/portals/housera/replies.functions";

const MAX = 2000;

/** Câmpul de răspuns către clientul Housera, afișat doar la lead-urile legate. */
export function HouseraReplyBox({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const stateFn = useServerFn(getHouseraReplyState);
  const sendFn = useServerFn(sendHouseraLeadReply);
  const state = useQuery({ queryKey: ["housera-reply-state", leadId], queryFn: () => stateFn({ data: { leadId } }) });
  const send = useMutation({
    mutationFn: () => sendFn({ data: { leadId, body } }),
    onSuccess: () => { setBody(""); qc.invalidateQueries({ queryKey: ["lead-detail", leadId] }); },
    onError: (e) => toastError(e),
  });
  if (!state.data?.linked) return null;
  const disabled = !state.data.canSend || state.data.reconnect;
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-border bg-card p-3">
      <Textarea
        value={body}
        maxLength={MAX}
        rows={3}
        placeholder="Scrie un răspuns pentru client pe Housera"
        disabled={disabled || send.isPending}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {state.data.reconnect
            ? "Reconectează Housera din Setări → Portaluri"
            : !state.data.canSend
              ? "Doar agentul responsabil sau administratorul agenției poate răspunde."
              : `${body.length}/${MAX}`}
        </span>
        <Button size="sm" disabled={disabled || send.isPending || !body.trim()} onClick={() => send.mutate()}>
          Trimite
        </Button>
      </div>
    </div>
  );
}

export function HouseraRetryButton({ leadId, messageId }: { leadId: string; messageId: string }) {
  const qc = useQueryClient();
  const retryFn = useServerFn(retryHouseraLeadReply);
  const retry = useMutation({
    mutationFn: () => retryFn({ data: { leadId, messageId } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["lead-detail", leadId] }),
    onError: (e) => toastError(e),
  });
  return (
    <Button size="sm" variant="outline" disabled={retry.isPending} onClick={() => retry.mutate()}>
      Reîncearcă
    </Button>
  );
}
