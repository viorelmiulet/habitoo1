/**
 * Superadmin → Email: căsuța de email a platformei (Mailgun).
 * Trei zone: căsuțe + dosare, lista de conversații, conversația deschisă
 * cu răspuns, atașamente și stare de livrare. HTML-ul primit este sanitizat
 * cu DOMPurify înainte de orice randare.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import DOMPurify from "dompurify";
import {
  Archive,
  ArchiveRestore,
  AlertOctagon,
  ArrowLeft,
  CircleAlert,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  Paperclip,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { appHead } from "@/components/app/app-head";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  createMailbox,
  getAttachmentUrl,
  getMailboxes,
  getMailMessages,
  getThread,
  getThreads,
  replyMail,
  sendMail,
  setMailThreadRead,
  setMailThreadStatus,
  updateMailbox,
  uploadMailAttachment,
} from "@/lib/mail-center.functions";
import type { MailAttachment, MailMailbox, MailMessage, MailThreadListItem } from "@/lib/mail-center.server";

export const Route = createFileRoute("/_authenticated/superadmin/mail")({
  head: () => appHead("Habitoo CRM — email platformă"),
  component: SuperadminMailPage,
});

type Folder = "open" | "archived" | "spam" | "sent";

const FOLDERS: { id: Folder; label: string; icon: typeof Inbox }[] = [
  { id: "open", label: "Primite", icon: Inbox },
  { id: "sent", label: "Trimise", icon: Send },
  { id: "archived", label: "Arhivate", icon: Archive },
  { id: "spam", label: "Spam", icon: AlertOctagon },
];

const DELIVERY_LABELS: Record<string, string> = {
  queued: "În coadă",
  sent: "Trimis",
  delivered: "Livrat",
  received: "Primit",
  failed: "Eșuat",
  bounced: "Respins",
  complained: "Reclamat",
};

function deliveryBadge(status: string) {
  const tone =
    status === "delivered" || status === "received"
      ? "bg-success/10 text-success border-success/30"
      : status === "failed" || status === "bounced" || status === "complained"
        ? "bg-destructive/10 text-destructive border-destructive/30"
        : "bg-muted text-muted-foreground border-border";
  return (
    <Badge variant="outline" className={cn("text-[11px] font-medium", tone)}>
      {DELIVERY_LABELS[status] ?? status}
    </Badge>
  );
}

function sanitizeMailHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "button", "iframe", "object", "embed", "link", "meta"],
    FORBID_ATTR: ["srcset", "onerror", "onload"],
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function SuperadminMailPage() {
  const queryClient = useQueryClient();
  const loadMailboxes = useServerFn(getMailboxes);

  const mailboxesQuery = useQuery({ queryKey: ["mail", "mailboxes"], queryFn: () => loadMailboxes() });
  const mailboxes = useMemo(() => mailboxesQuery.data?.mailboxes ?? [], [mailboxesQuery.data]);
  const status = mailboxesQuery.data?.status;

  const [mailboxId, setMailboxId] = useState<string | null>(null);
  const [folder, setFolder] = useState<Folder>("open");
  const [page, setPage] = useState(0);
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  // Aleg implicit prima căsuță activă, ca lista să nu pornească goală.
  useEffect(() => {
    if (mailboxId === null && mailboxes.length) {
      setMailboxId((mailboxes.find((m) => m.is_active) ?? mailboxes[0])!.id);
    }
  }, [mailboxes, mailboxId]);

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["mail"] });
  };

  if (mailboxesQuery.isError) {
    return (
      <>
        <PageHeader title="Email platformă" description="Căsuța de email a platformei, prin Mailgun." />
        <QueryError message="Căsuța de email nu a putut fi încărcată." onRetry={() => mailboxesQuery.refetch()} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Email platformă"
        description="Trimite și primește emailuri pe domeniul propriu, doar pentru Superadmin."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refreshAll}>
              <RefreshCw className="mr-1.5 h-4 w-4" /> Reîmprospătează
            </Button>
            <Button variant="outline" size="sm" onClick={() => setManageOpen(true)}>
              <Settings2 className="mr-1.5 h-4 w-4" /> Căsuțe
            </Button>
            <Button size="sm" onClick={() => setComposeOpen(true)} disabled={!mailboxes.some((m) => m.is_active)}>
              <Plus className="mr-1.5 h-4 w-4" /> Email nou
            </Button>
          </div>
        }
      />

      {status && !status.mailgun_configured && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <p className="font-medium">Mailgun nu este configurat complet.</p>
            <p className="text-muted-foreground">
              Lipsesc: {status.missing.join(", ") || "—"}. Endpointuri de configurat în Mailgun:{" "}
              <code className="text-xs">{status.inbound_endpoint}</code> și{" "}
              <code className="text-xs">{status.events_endpoint}</code>
            </p>
          </div>
        </div>
      )}

      {mailboxesQuery.isLoading ? (
        <InlineLoading label="Se încarcă căsuțele de email…" />
      ) : !mailboxes.length ? (
        <EmptyState
          icon={Mail}
          title="Nicio căsuță configurată"
          description="Adaugă prima căsuță de email (ex. contact@domeniul-tău) ca să poți primi și trimite mesaje."
          action={
            <Button size="sm" onClick={() => setManageOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Adaugă căsuță
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          {/* Căsuțe + dosare */}
          <aside className="space-y-4">
            <div className="space-y-1.5">
              <Label>Căsuță</Label>
              <Select value={mailboxId ?? ""} onValueChange={(v) => { setMailboxId(v); setSelectedThread(null); setPage(0); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Alege căsuța" />
                </SelectTrigger>
                <SelectContent>
                  {mailboxes.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.address}
                      {!m.is_active ? " (inactivă)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <nav className="space-y-1">
              {FOLDERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => { setFolder(f.id); setPage(0); setSelectedThread(null); }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    folder === f.id
                      ? "bg-accent/15 text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <f.icon className="h-4 w-4" />
                  {f.label}
                </button>
              ))}
            </nav>
          </aside>

          {/* Listă + detaliu */}
          <div className="min-w-0">
            {folder === "sent" ? (
              <SentList mailboxId={mailboxId} page={page} setPage={setPage} onOpenThread={setSelectedThread} />
            ) : selectedThread ? (
              <ThreadView
                threadId={selectedThread}
                onBack={() => setSelectedThread(null)}
                onChanged={refreshAll}
              />
            ) : (
              <ThreadList
                mailboxId={mailboxId}
                status={folder}
                page={page}
                setPage={setPage}
                onOpen={(id) => setSelectedThread(id)}
              />
            )}
          </div>
        </div>
      )}

      <ComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        mailboxes={mailboxes.filter((m) => m.is_active)}
        defaultMailboxId={mailboxId}
        onSent={() => { setComposeOpen(false); refreshAll(); }}
      />
      <MailboxesDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        mailboxes={mailboxes}
        onChanged={refreshAll}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lista de conversații                                                */
/* ------------------------------------------------------------------ */

function ThreadList({
  mailboxId,
  status,
  page,
  setPage,
  onOpen,
}: {
  mailboxId: string | null;
  status: "open" | "archived" | "spam";
  page: number;
  setPage: (p: number) => void;
  onOpen: (threadId: string) => void;
}) {
  const load = useServerFn(getThreads);
  const query = useQuery({
    queryKey: ["mail", "threads", mailboxId, status, page],
    queryFn: () => load({ data: { mailboxId, status, page } }),
    enabled: !!mailboxId,
  });

  if (query.isError) return <QueryError message="Conversațiile nu au putut fi încărcate." onRetry={() => query.refetch()} />;
  if (query.isLoading) return <InlineLoading label="Se încarcă conversațiile…" />;

  const threads = query.data?.threads ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));

  if (!threads.length) {
    return (
      <EmptyState
        icon={Inbox}
        title="Nicio conversație"
        description={status === "open" ? "Emailurile primite vor apărea aici." : "Nimic în acest dosar."}
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {threads.map((t, i) => (
          <ThreadRow key={t.id} thread={t} first={i === 0} onOpen={() => onOpen(t.id)} />
        ))}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Pagina {page + 1} din {totalPages} · {total} conversații
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)}>
              Următor
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ThreadRow({ thread, first, onOpen }: { thread: MailThreadListItem; first: boolean; onOpen: () => void }) {
  const counterpart =
    thread.participants.find((p) => !p.endsWith("@mail.habitoo.ro")) ?? thread.participants[0] ?? "—";
  const unread = thread.unread_count > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60",
        !first && "border-t border-border",
      )}
    >
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold", unread ? "bg-accent/20 text-accent-foreground" : "bg-muted text-muted-foreground")}>
        {counterpart.slice(0, 2).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn("truncate text-sm", unread ? "font-semibold text-foreground" : "font-medium text-foreground/90")}>
            {counterpart}
          </span>
          {unread && <Badge className="bg-accent text-accent-foreground">{thread.unread_count} noi</Badge>}
          {thread.has_attachments && <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />}
        </span>
        <span className={cn("block truncate text-sm", unread ? "font-medium text-foreground" : "text-muted-foreground")}>
          {thread.subject || "(fără subiect)"}
        </span>
        {thread.preview && <span className="block truncate text-xs text-muted-foreground">{thread.preview}</span>}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {thread.last_message_at ? formatDateTime(thread.last_message_at) : ""}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Trimise                                                             */
/* ------------------------------------------------------------------ */

function SentList({
  mailboxId,
  page,
  setPage,
  onOpenThread,
}: {
  mailboxId: string | null;
  page: number;
  setPage: (p: number) => void;
  onOpenThread: (threadId: string) => void;
}) {
  const load = useServerFn(getMailMessages);
  const query = useQuery({
    queryKey: ["mail", "sent", mailboxId, page],
    queryFn: () => load({ data: { mailboxId, direction: "outbound", page } }),
    enabled: !!mailboxId,
  });

  if (query.isError) return <QueryError message="Mesajele trimise nu au putut fi încărcate." onRetry={() => query.refetch()} />;
  if (query.isLoading) return <InlineLoading label="Se încarcă mesajele trimise…" />;

  const messages = query.data?.messages ?? [];
  if (!messages.length) {
    return <EmptyState icon={Send} title="Niciun email trimis" description="Mesajele trimise din această căsuță vor apărea aici." />;
  }

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {messages.map((m, i) => (
          <button
            key={m.id}
            type="button"
            disabled={!m.thread_id}
            onClick={() => m.thread_id && onOpenThread(m.thread_id)}
            className={cn(
              "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 disabled:cursor-default",
              i > 0 && "border-t border-border",
            )}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Send className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                Către: {m.to_emails.join(", ")}
              </span>
              <span className="block truncate text-sm text-muted-foreground">{m.subject || "(fără subiect)"}</span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              {deliveryBadge(m.delivery_status)}
              <span className="text-xs text-muted-foreground">{formatDateTime(m.sent_at ?? m.created_at)}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
          Anterior
        </Button>
        <Button variant="outline" size="sm" disabled={messages.length < 50} onClick={() => setPage(page + 1)}>
          Următor
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Conversație deschisă                                                */
/* ------------------------------------------------------------------ */

function ThreadView({ threadId, onBack, onChanged }: { threadId: string; onBack: () => void; onChanged: () => void }) {
  const load = useServerFn(getThread);
  const markRead = useServerFn(setMailThreadRead);
  const setStatus = useServerFn(setMailThreadStatus);
  const getUrl = useServerFn(getAttachmentUrl);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["mail", "thread", threadId],
    queryFn: () => load({ data: { threadId } }),
  });

  const thread = query.data?.thread;
  const messages = useMemo(() => query.data?.messages ?? [], [query.data]);
  const attachments = query.data?.attachments ?? [];

  // La deschidere marcăm ca citit; contoarele se recalculează în baza de date.
  useEffect(() => {
    if (thread && thread.unread_count > 0) {
      void markRead({ data: { threadId, read: true } }).then(() => {
        void queryClient.invalidateQueries({ queryKey: ["mail", "threads"] });
      });
    }
  }, [thread, threadId, markRead, queryClient]);

  const changeStatus = async (status: "open" | "archived" | "spam") => {
    const res = await setStatus({ data: { threadId, status } });
    if (res.error) toast.error(res.error);
    else {
      toast.success(status === "open" ? "Conversația a fost redeschisă." : status === "archived" ? "Conversația a fost arhivată." : "Conversația a fost mutată în spam.");
      onChanged();
      onBack();
    }
  };

  const downloadAttachment = async (attachmentId: string) => {
    const res = await getUrl({ data: { attachmentId } });
    if (res.error || !res.url) toast.error(res.error ?? "Linkul nu a putut fi generat.");
    else window.open(res.url, "_blank", "noopener");
  };

  if (query.isError) return <QueryError message="Conversația nu a putut fi încărcată." onRetry={() => query.refetch()} />;
  if (query.isLoading || !thread) return <InlineLoading label="Se încarcă conversația…" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Înapoi
        </Button>
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{thread.subject || "(fără subiect)"}</h2>
        {thread.status !== "open" ? (
          <Button variant="outline" size="sm" onClick={() => changeStatus("open")}>
            <ArchiveRestore className="mr-1.5 h-4 w-4" /> Redeschide
          </Button>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={() => changeStatus("archived")}>
              <Archive className="mr-1.5 h-4 w-4" /> Arhivează
            </Button>
            <Button variant="outline" size="sm" onClick={() => changeStatus("spam")}>
              <AlertOctagon className="mr-1.5 h-4 w-4" /> Spam
            </Button>
          </>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            const res = await markRead({ data: { threadId, read: false } });
            if (res.error) toast.error(res.error);
            else {
              toast.success("Marcată ca necitită.");
              void queryClient.invalidateQueries({ queryKey: ["mail", "threads"] });
            }
          }}
        >
          <Mail className="mr-1.5 h-4 w-4" /> Necitită
        </Button>
      </div>

      <div className="space-y-3">
        {messages.map((m) => (
          <MessageCard
            key={m.id}
            message={m}
            attachments={attachments.filter((a) => a.message_id === m.id)}
            onDownload={downloadAttachment}
          />
        ))}
      </div>

      <ReplyBox threadId={threadId} onSent={() => { void query.refetch(); onChanged(); }} />
    </div>
  );
}

function MessageCard({
  message,
  attachments,
  onDownload,
}: {
  message: MailMessage;
  attachments: MailAttachment[];
  onDownload: (id: string) => void;
}) {
  const inbound = message.direction === "inbound";
  const html = message.html_body ? sanitizeMailHtml(message.html_body) : null;
  const text = message.stripped_text || message.text_body;

  return (
    <article
      className={cn(
        "rounded-xl border p-4",
        inbound ? "border-border bg-surface" : "border-accent/30 bg-accent/5",
      )}
    >
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground",
            inbound ? "bg-muted" : "bg-accent/15 text-accent-foreground",
          )}
        >
          {inbound ? <MailOpen className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {message.from_name ? `${message.from_name} <${message.from_email}>` : message.from_email}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            Către: {message.to_emails.join(", ")}
            {message.cc_emails.length ? ` · CC: ${message.cc_emails.join(", ")}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {deliveryBadge(message.delivery_status)}
          <span className="text-xs text-muted-foreground">
            {formatDateTime(message.received_at ?? message.sent_at ?? message.created_at)}
          </span>
        </div>
      </header>

      {html ? (
        <div
          className="prose prose-sm max-w-none overflow-x-auto text-foreground [&_a]:text-accent-foreground [&_img]:max-w-full"
          // HTML sanitizat cu DOMPurify mai sus — singura cale de randare.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <p className="whitespace-pre-wrap text-sm text-foreground/90">{text || "(mesaj gol)"}</p>
      )}

      {message.last_error && (
        <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Eroare livrare: {message.last_error}
        </p>
      )}

      {attachments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          {attachments.map((a) => (
            <Button
              key={a.id}
              variant="outline"
              size="sm"
              disabled={a.status !== "stored"}
              title={a.status !== "stored" ? a.rejected_reason ?? "Indisponibil" : a.filename}
              onClick={() => onDownload(a.id)}
            >
              <Paperclip className="mr-1.5 h-3.5 w-3.5" />
              <span className="max-w-48 truncate">{a.filename}</span>
              <span className="ml-1 text-xs text-muted-foreground">({Math.ceil(a.size_bytes / 1024)} KB)</span>
            </Button>
          ))}
        </div>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Răspuns                                                             */
/* ------------------------------------------------------------------ */

function useStagedAttachments() {
  const upload = useServerFn(uploadMailAttachment);
  const [items, setItems] = useState<{ id: string; filename: string; size: number }[]>([]);
  const [uploading, setUploading] = useState(false);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const dataBase64 = await fileToBase64(file);
        const res = await upload({
          data: { filename: file.name, contentType: file.type || "application/octet-stream", dataBase64 },
        });
        if (res.error || !res.upload) toast.error(res.error ?? `Fișierul ${file.name} nu a putut fi încărcat.`);
        else setItems((prev) => [...prev, { id: res.upload!.id, filename: file.name, size: file.size }]);
      }
    } finally {
      setUploading(false);
    }
  };

  return { items, uploading, addFiles, remove: (id: string) => setItems((p) => p.filter((i) => i.id !== id)), reset: () => setItems([]) };
}

function AttachmentPicker({
  staged,
  inputRef,
}: {
  staged: ReturnType<typeof useStagedAttachments>;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          void staged.addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={staged.uploading} onClick={() => inputRef.current?.click()}>
          {staged.uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Paperclip className="mr-1.5 h-4 w-4" />}
          Atașează
        </Button>
        {staged.items.map((i) => (
          <span key={i.id} className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
            <span className="max-w-40 truncate">{i.filename}</span>
            <button type="button" aria-label={`Elimină ${i.filename}`} onClick={() => staged.remove(i.id)}>
              <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

function ReplyBox({ threadId, onSent }: { threadId: string; onSent: () => void }) {
  const reply = useServerFn(replyMail);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const staged = useStagedAttachments();
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Cheie de idempotență stabilă per boză: un retry nu trimite de două ori.
  const sendKeyRef = useRef(crypto.randomUUID());

  const send = async () => {
    if (!text.trim() && !staged.items.length) {
      toast.error("Scrie un mesaj sau atașează un fișier.");
      return;
    }
    setSending(true);
    try {
      const res = await reply({
        data: {
          threadId,
          text: text.trim() || null,
          sendKey: sendKeyRef.current,
          attachmentIds: staged.items.map((i) => i.id),
        },
      });
      if (!res.ok) {
        toast.error(res.error ?? "Răspunsul nu a putut fi trimis.");
        return;
      }
      toast.success("Răspuns trimis.");
      setText("");
      staged.reset();
      sendKeyRef.current = crypto.randomUUID();
      onSent();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <Label htmlFor="reply-body">Răspunde</Label>
      <Textarea
        id="reply-body"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="Scrie răspunsul…"
      />
      <AttachmentPicker staged={staged} inputRef={fileRef} />
      <div className="flex justify-end">
        <Button size="sm" onClick={send} disabled={sending}>
          {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
          Trimite răspuns
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Email nou                                                           */
/* ------------------------------------------------------------------ */

function ComposeDialog({
  open,
  onOpenChange,
  mailboxes,
  defaultMailboxId,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mailboxes: MailMailbox[];
  defaultMailboxId: string | null;
  onSent: () => void;
}) {
  const send = useServerFn(sendMail);
  const [mailboxId, setMailboxId] = useState<string>("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const staged = useStagedAttachments();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const sendKeyRef = useRef(crypto.randomUUID());

  useEffect(() => {
    if (open) {
      setMailboxId((mailboxes.find((m) => m.id === defaultMailboxId) ?? mailboxes[0])?.id ?? "");
      sendKeyRef.current = crypto.randomUUID();
    }
  }, [open, mailboxes, defaultMailboxId]);

  const split = (value: string) => value.split(/[;,]/).map((s) => s.trim()).filter(Boolean);

  const submit = async () => {
    const recipients = split(to);
    if (!mailboxId) return toast.error("Alege căsuța expeditor.");
    if (!recipients.length) return toast.error("Adaugă cel puțin un destinatar.");
    if (!subject.trim()) return toast.error("Adaugă un subiect.");
    if (!text.trim() && !staged.items.length) return toast.error("Scrie un mesaj sau atașează un fișier.");

    setSending(true);
    try {
      const res = await send({
        data: {
          mailboxId,
          to: recipients,
          cc: split(cc),
          subject: subject.trim(),
          text: text.trim() || null,
          sendKey: sendKeyRef.current,
          attachmentIds: staged.items.map((i) => i.id),
        },
      });
      if (!res.ok) {
        toast.error(res.error ?? "Emailul nu a putut fi trimis.");
        sendKeyRef.current = crypto.randomUUID();
        return;
      }
      toast.success("Email trimis.");
      setTo(""); setCc(""); setSubject(""); setText("");
      staged.reset();
      onSent();
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Email nou</DialogTitle>
          <DialogDescription>Trimite un email dintr-o căsuță a platformei.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>De la</Label>
              <Select value={mailboxId} onValueChange={setMailboxId}>
                <SelectTrigger><SelectValue placeholder="Alege căsuța" /></SelectTrigger>
                <SelectContent>
                  {mailboxes.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.display_name ? `${m.display_name} <${m.address}>` : m.address}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="compose-to">Către</Label>
              <Input id="compose-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@exemplu.ro, alt@exemplu.ro" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="compose-cc">CC (opțional)</Label>
              <Input id="compose-cc" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="coleg@exemplu.ro" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="compose-subject">Subiect</Label>
              <Input id="compose-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subiectul emailului" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="compose-body">Mesaj</Label>
            <Textarea id="compose-body" value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder="Scrie mesajul…" />
          </div>
          <AttachmentPicker staged={staged} inputRef={fileRef} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Renunță
          </Button>
          <Button onClick={submit} disabled={sending}>
            {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
            Trimite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Administrare căsuțe                                                 */
/* ------------------------------------------------------------------ */

function MailboxesDialog({
  open,
  onOpenChange,
  mailboxes,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mailboxes: MailMailbox[];
  onChanged: () => void;
}) {
  const create = useServerFn(createMailbox);
  const update = useServerFn(updateMailbox);
  const [address, setAddress] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!address.trim()) return toast.error("Adaugă adresa de email.");
    setSaving(true);
    try {
      const res = await create({
        data: { address: address.trim(), displayName: displayName.trim() || null, scope: "platform", isActive: true },
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Căsuța a fost creată.");
        setAddress(""); setDisplayName("");
        onChanged();
      }
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (mailbox: MailMailbox, active: boolean) => {
    const res = await update({ data: { mailboxId: mailbox.id, isActive: active } });
    if (res.error) toast.error(res.error);
    else {
      toast.success(active ? "Căsuța a fost activată." : "Căsuța a fost dezactivată.");
      onChanged();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Căsuțe de email</DialogTitle>
          <DialogDescription>
            Adresele de pe care platforma trimite și primește emailuri. Fiecare adresă trebuie să existe și în Mailgun.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {mailboxes.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.address}</p>
                {m.display_name && <p className="truncate text-xs text-muted-foreground">{m.display_name}</p>}
              </div>
              <Badge variant="outline" className="text-[11px]">{m.scope === "platform" ? "Platformă" : "Agenție"}</Badge>
              <Switch checked={m.is_active} onCheckedChange={(v) => toggle(m, v)} aria-label={`Activează ${m.address}`} />
            </div>
          ))}
          {!mailboxes.length && <p className="text-sm text-muted-foreground">Nicio căsuță configurată încă.</p>}
        </div>

        <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
          <p className="text-sm font-medium">Căsuță nouă</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mb-address">Adresă</Label>
              <Input id="mb-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="contact@domeniu.ro" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mb-name">Nume afișat (opțional)</Label>
              <Input id="mb-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Habitoo" />
            </div>
          </div>
          <Button size="sm" onClick={add} disabled={saving}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
            Adaugă căsuța
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
