import { useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minimize2, Minus, Send, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

export type ReplyTarget = { id: string; direction: string; from_email: string; to_emails: string[] };
export function replyRecipients(message: ReplyTarget) {
  return message.direction === "inbound" ? message.from_email : message.to_emails.join(", ");
}

export function MailReplyWindow({ target, threadId, subject, attachmentIds, uploading, attachments, picker, onSend, onClose, onSent }: {
  target: ReplyTarget;
  threadId: string;
  subject: string;
  attachmentIds: string[];
  uploading: boolean;
  attachments: ReactNode;
  picker: ReactNode;
  onSend: (data: { threadId: string; text: string | null; sendKey: string; attachmentIds: string[] }) => Promise<{ ok: boolean; error?: string | null }>;
  onClose: () => void;
  onSent: () => void;
}) {
  const [text, setText] = useState("");
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const sendKey = useRef<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setMinimized(false); }, [target.id]);
  useEffect(() => { if (!minimized) textRef.current?.focus(); }, [minimized, target.id]);

  const close = () => {
    if (sendingRef.current || uploading) return;
    if (text.trim() || attachmentIds.length) setDiscard(true);
    else onClose();
  };
  const send = async () => {
    if (sendingRef.current || uploading || (!text.trim() && !attachmentIds.length)) return;
    sendingRef.current = true;
    setSending(true);
    sendKey.current ??= crypto.randomUUID();
    try {
      const result = await onSend({ threadId, text: text.trim() || null, sendKey: sendKey.current, attachmentIds });
      if (!result.ok) { toast.error(result.error ?? "Răspunsul nu a putut fi trimis."); return; }
      toast.success("Răspuns trimis.");
      onSent();
      onClose();
    } catch {
      toast.error("Răspunsul nu a putut fi trimis. Încearcă din nou.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return <>
    <section aria-label="Răspuns" className={cn(
      "fixed z-50 flex flex-col overflow-hidden border border-border bg-background shadow-xl",
      minimized ? "bottom-0 right-0 h-auto w-full sm:bottom-4 sm:right-4 sm:w-[560px] sm:max-w-[calc(100vw-2rem)] sm:rounded-t-lg" :
        expanded ? "inset-0 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[85dvh] sm:w-[960px] sm:max-w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg" :
          "inset-0 sm:inset-auto sm:bottom-4 sm:right-4 sm:h-[min(600px,calc(100dvh-2rem))] sm:w-[560px] sm:max-w-[calc(100vw-2rem)] sm:rounded-t-lg",
    )}>
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-muted px-4 py-2">
        <h3 className="text-sm font-semibold">Răponse<span className="sr-only" /></h3>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label={minimized ? "Redeschide răspunsul" : "Minimizează"} title={minimized ? "Redeschide răspunsul" : "Minimizează"} onClick={() => setMinimized(!minimized)}><Minus className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" aria-label={expanded ? "Micșorează" : "Mărește"} title={expanded ? "Micșorează" : "Mărește"} onClick={() => { setExpanded(!expanded); setMinimized(false); }}>{expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Button>
          <Button variant="ghost" size="icon" aria-label="Închide răspunsul" title="Închide răspunsul" disabled={sending || uploading} onClick={close}><X className="h-4 w-4" /></Button>
        </div>
      </header>
      {!minimized && <>
        <div className="shrink-0 space-y-2 border-b border-border px-4 py-3 text-sm">
          <p className="break-words"><span className="text-muted-foreground">Către: </span>{replyRecipients(target)}</p>
          <p className="break-words"><span className="text-muted-foreground">Subiect: </span>Re: {subject}</p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
          <Textarea ref={textRef} aria-label="Textul răspunsului" value={text} onChange={(e) => setText(e.target.value)} disabled={sending} className="min-h-40 flex-1 resize-none" placeholder="Scrie răspunsul…" />
          <div className="mt-3 flex flex-wrap gap-2">{attachments}</div>
        </div>
        <footer className="flex shrink-0 items-center gap-3 border-t border-border px-4 py-3">
          <Button onClick={() => void send()} disabled={sending || uploading || (!text.trim() && !attachmentIds.length)}>{sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Trimite</Button>
          {picker}
        </footer>
      </>}
    </section>
    <ConfirmDialog open={discard} onOpenChange={setDiscard} title="Renunți la răspuns?" description="Textul și atașamentele acestui răspuns vor fi eliminate." confirmLabel="Renunță la răspuns" cancelLabel="Continuă răspunsul" destructive onConfirm={onClose} />
  </>;
}