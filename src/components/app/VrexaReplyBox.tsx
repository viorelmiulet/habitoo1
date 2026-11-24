import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toastError } from "@/lib/errors";
import { getVrexaReplyState, retryVrexaLeadReply, sendVrexaLeadReply } from "@/lib/portals/vrexa/replies.functions";

const MAX = 2000;

/** Câmpul de răspuns către clientul Vrexa, afișat doar la lead-urile legate. */
export function VrexaReplyBox({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const stateFn = useServerFn(getVrexaReplyState);
  const sendFn = useServerFn(sendVrexaLeadReply);
  const state = useQuery({ queryKey: ["vrexa-reply-state", leadId], queryFn: () => stateFn({ data: { leadId } }) });
  const send = useMutation({
    mutationFn: () => sendFn({ data: { leadId, body } }),
    onSuccess: () => { setBody(""); qc.invalidateQueries({ queryKey: ["lead-detail", leadId] }); },
    onError: (e) => toastError(e),
  });
  if (!state.data?.linked) return null;
  const disabled = !state.data.canSend;
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-border bg-card p-3">
      <Textarea value={body} maxLength={MAX} rows={3} placeholder="Scrie un răspuns pentru client pe Vrexa"
        disabled={disabled || send.isPending} onChange={(e) => setBody(e.target.value)} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {disabled ? "Doar agentul responsabil sau administratorul agenției poate răspunde." : `${body.length}/${MAX}`}
        </span>
        <Button size="sm" disabled={disabled || send.isPending || !body.trim()} onClick={() => send.mutate()}>Trimite</Button>
      </div>
    </div>
  );
}

export function VrexaRetryButton({ leadId, messageId }: { leadId: string; messageId: string }) {
  const qc = useQueryClient();
  const retryFn = useServerFn(retryVrexaLeadReply);
  const retry = useMutation({
    mutationFn: () => retryFn({ data: { leadId, messageId } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["lead-detail", leadId] }),
    onError: (e) => toastError(e),
  });
  return <Button size="sm" variant="outline" disabled={retry.isPending} onClick={() => retry.mutate()}>Retrimite</Button>;
}
