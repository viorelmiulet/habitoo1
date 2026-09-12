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
  ImageOff,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { appHead } from "@/components/app/app-head";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  createMailbox,
  deleteMailDraft,
  getAttachmentUrl,
  getMailboxes,
  getMailMessages,
  getThread,
  getThreads,
  replyMail,
  saveMailDraft,
  sendMail,
  setMailThreadRead,
  setMailThreadStatus,
  updateMailbox,
  uploadMailAttachment,
} from "@/lib/mail-center.functions";
import type {
  MailAttachment,
  MailMailbox,
  MailMessage,
  MailThreadListItem,
} from "@/lib/mail-center.server";

export const Route = createFileRoute("/_authenticated/superadmin/mail")({
  head: () => appHead("Habitoo CRM — email platformă"),
  component: SuperadminMailPage,
});

type Folder = "open" | "archived" | "spam" | "sent" | "draft";

const FOLDERS: { id: Folder; label: string; icon: typeof Inbox }[] = [
  { id: "open", label: "Primite", icon: Inbox },
  { id: "sent", label: "Trimise", icon: Send },
  { id: "draft", label: "Ciorne", icon: Mail },
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

/* ------------------------------------------------------------------ */
/* Igienizare HTML                                                     */
/* ------------------------------------------------------------------ */

/** Numărăm imaginile blocate în timpul igienizării, nu după. */
let blockRemoteImages = true;
let blockedImageCount = 0;
let hooksInstalled = false;

/** Doar scheme inofensive: `javascript:`, `data:` și `vbscript:` cad afară. */
const SAFE_URI = /^(?:https?:|mailto:|tel:|cid:|#|\/)/i;

function installHooks() {
  if (hooksInstalled || typeof window === "undefined") return;
  hooksInstalled = true;

  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    const el = node as Element;
    const tag = el.tagName?.toUpperCase();

    // Orice atribut de eveniment rămas dispare, indiferent de nume.
    for (const attr of Array.from(el.attributes ?? [])) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
    }

    if (tag === "A") {
      const href = el.getAttribute("href") ?? "";
      if (href && !SAFE_URI.test(href.trim())) el.removeAttribute("href");
      // Linkurile externe se deschid izolat, fără acces la fereastra noastră.
      if (el.getAttribute("href")) {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      }
    }

    if (tag === "IMG") {
      el.removeAttribute("srcset");
      const src = el.getAttribute("src") ?? "";
      if (src && !SAFE_URI.test(src.trim())) {
        el.removeAttribute("src");
        return;
      }
      // Imaginile la distanță sunt urmăritori de deschidere: implicit nu se
      // încarcă, adresa e păstrată doar ca text până când utilizatorul cere.
      if (blockRemoteImages && /^https?:/i.test(src.trim())) {
        el.removeAttribute("src");
        el.setAttribute("data-blocked-src", src);
        el.setAttribute("alt", el.getAttribute("alt") || "Imagine blocată");
        blockedImageCount += 1;
      } else if (src) {
        el.setAttribute("loading", "lazy");
        el.setAttribute("referrerpolicy", "no-referrer");
      }
    }
  });
}

function sanitizeMailHtml(html: string, showImages: boolean): { html: string; blocked: number } {
  installHooks();
  blockRemoteImages = !showImages;
  blockedImageCount = 0;
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      "style",
      "form",
      "input",
      "button",
      "select",
      "textarea",
      "iframe",
      "object",
      "embed",
      "param",
      "applet",
      "script",
      "svg",
      "math",
      "link",
      "meta",
      "base",
      "frame",
      "frameset",
    ],
    FORBID_ATTR: ["srcset", "formaction", "background", "style"],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["target", "rel", "data-blocked-src", "loading", "referrerpolicy"],
  });
  return { html: clean, blocked: blockedImageCount };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/* ------------------------------------------------------------------ */
/* Filtre de căutare                                                   */
/* ------------------------------------------------------------------ */

type MailFilters = {
  /** Text liber: expeditor, destinatar, subiect, conținut. */
  q: string;
  unreadOnly: boolean;
  withAttachments: boolean;
  /** Interval pe data ultimului mesaj (input `date`, format YYYY-MM-DD). */
  from: string;
  to: string;
};

const EMPTY_FILTERS: MailFilters = {
  q: "",
  unreadOnly: false,
  withAttachments: false,
  from: "",
  to: "",
};

/** `2026-09-11` -> ISO la începutul/sfârșitul zilei, ca intervalul să fie inclusiv. */
function dayBoundary(value: string, end: boolean): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function MailSearchBar({
  filters,
  onChange,
}: {
  filters: MailFilters;
  onChange: (next: MailFilters) => void;
}) {
  const [term, setTerm] = useState(filters.q);
  const active =
    filters.q || filters.unreadOnly || filters.withAttachments || filters.from || filters.to;

  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onChange({ ...filters, q: term.trim() });
      }}
    >
      <div className="min-w-56 flex-1 space-y-1.5">
        <Label htmlFor="mail-search">Caută</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="mail-search"
            className="pl-8"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Expeditor, destinatar, subiect sau conținut"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="mail-from">De la data</Label>
        <Input
          id="mail-from"
          type="date"
          className="w-40"
          value={filters.from}
          onChange={(e) => onChange({ ...filters, from: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="mail-to">Până la data</Label>
        <Input
          id="mail-to"
          type="date"
          className="w-40"
          value={filters.to}
          onChange={(e) => onChange({ ...filters, to: e.target.value })}
        />
      </div>
      <Button type="submit" size="sm">
        <Search className="mr-1.5 h-4 w-4" /> Caută
      </Button>
      <Button
        type="button"
        variant={filters.unreadOnly ? "default" : "outline"}
        size="sm"
        onClick={() => onChange({ ...filters, unreadOnly: !filters.unreadOnly })}
      >
        <Mail className="mr-1.5 h-4 w-4" /> Necitite
      </Button>
      <Button
        type="button"
        variant={filters.withAttachments ? "default" : "outline"}
        size="sm"
        onClick={() => onChange({ ...filters, withAttachments: !filters.withAttachments })}
      >
        <Paperclip className="mr-1.5 h-4 w-4" /> Cu atașamente
      </Button>
      {active && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setTerm("");
            onChange(EMPTY_FILTERS);
          }}
        >
          <X className="mr-1.5 h-4 w-4" /> Golește
        </Button>
      )}
    </form>
  );
}

function SuperadminMailPage() {
  const queryClient = useQueryClient();
  const loadMailboxes = useServerFn(getMailboxes);

  const mailboxesQuery = useQuery({
    queryKey: ["mail", "mailboxes"],
    queryFn: () => loadMailboxes(),
  });
  const mailboxes = useMemo(() => mailboxesQuery.data?.mailboxes ?? [], [mailboxesQuery.data]);
  const status = mailboxesQuery.data?.status;

  const [mailboxId, setMailboxId] = useState<string | null>(null);
  const [folder, setFolder] = useState<Folder>("open");
  const [page, setPage] = useState(0);
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [filters, setFilters] = useState<MailFilters>(EMPTY_FILTERS);
  const [editingDraft, setEditingDraft] = useState<MailMessage | null>(null);

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
        <PageHeader
          title="Email platformă"
          description="Căsuța de email a platformei, prin Mailgun."
        />
        <QueryError error={mailboxesQuery.error} onRetry={() => mailboxesQuery.refetch()} />
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
            <Button
              size="sm"
              onClick={() => setComposeOpen(true)}
              disabled={!mailboxes.some((m) => m.is_active)}
            >
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
              <Select
                value={mailboxId ?? ""}
                onValueChange={(v) => {
                  setMailboxId(v);
                  setSelectedThread(null);
                  setPage(0);
                }}
              >
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
                  onClick={() => {
                    setFolder(f.id);
                    setPage(0);
                    setSelectedThread(null);
                  }}
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
          <div className="min-w-0 space-y-3">
            {folder !== "sent" && folder !== "draft" && !selectedThread && (
              <MailSearchBar
                filters={filters}
                onChange={(next) => {
                  setFilters(next);
                  setPage(0);
                }}
              />
            )}
            {folder === "sent" ? (
              <SentList
                mailboxId={mailboxId}
                page={page}
                setPage={setPage}
                onOpenThread={setSelectedThread}
              />
            ) : folder === "draft" ? (
              <DraftsList
                mailboxId={mailboxId}
                page={page}
                setPage={setPage}
                onEdit={(draft) => {
                  setEditingDraft(draft);
                  setComposeOpen(true);
                }}
                onChanged={refreshAll}
              />
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
                filters={filters}
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
        onOpenChange={(open) => {
          setComposeOpen(open);
          if (!open) setEditingDraft(null);
        }}
        mailboxes={mailboxes.filter((m) => m.is_active)}
        defaultMailboxId={mailboxId}
        draft={editingDraft}
        onSent={() => {
          setComposeOpen(false);
          setEditingDraft(null);
          refreshAll();
        }}
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
  filters,
  page,
  setPage,
  onOpen,
}: {
  mailboxId: string | null;
  status: "open" | "archived" | "spam";
  filters: MailFilters;
  page: number;
  setPage: (p: number) => void;
  onOpen: (threadId: string) => void;
}) {
  const load = useServerFn(getThreads);
  const args = {
    mailboxId,
    status,
    page,
    q: filters.q || null,
    unreadOnly: filters.unreadOnly,
    hasAttachments: filters.withAttachments ? true : null,
    from: dayBoundary(filters.from, false),
    to: dayBoundary(filters.to, true),
  };
  const query = useQuery({
    queryKey: ["mail", "threads", args],
    queryFn: () => load({ data: args }),
    enabled: !!mailboxId,
  });

  if (query.isError) return <QueryError error={query.error} onRetry={() => query.refetch()} />;
  if (query.isLoading) return <InlineLoading label="Se încarcă conversațiile…" />;

  const threads = query.data?.threads ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));
  const filtered = !!(
    filters.q ||
    filters.unreadOnly ||
    filters.withAttachments ||
    filters.from ||
    filters.to
  );

  if (!threads.length) {
    return (
      <EmptyState
        icon={Inbox}
        title={filtered ? "Nicio conversație găsită" : "Nicio conversație"}
        description={
          filtered
            ? "Încearcă alt text de căutare sau golește filtrele."
            : status === "open"
              ? "Emailurile primite vor apărea aici."
              : "Nimic în acest dosar."
        }
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
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Următor
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ThreadRow({
  thread,
  first,
  onOpen,
}: {
  thread: MailThreadListItem;
  first: boolean;
  onOpen: () => void;
}) {
  const counterpart =
    thread.participants.find((p) => !p.endsWith("@mail.habitoo.ro")) ??
    thread.participants[0] ??
    "—";
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
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          unread ? "bg-accent/20 text-accent-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {counterpart.slice(0, 2).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-sm",
              unread ? "font-semibold text-foreground" : "font-medium text-foreground/90",
            )}
          >
            {counterpart}
          </span>
          {unread && (
            <Badge className="bg-accent text-accent-foreground">{thread.unread_count} noi</Badge>
          )}
          {thread.has_attachments && <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />}
        </span>
        <span
          className={cn(
            "block truncate text-sm",
            unread ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {thread.subject || "(fără subiect)"}
        </span>
        {thread.preview && (
          <span className="block truncate text-xs text-muted-foreground">{thread.preview}</span>
        )}
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

  if (query.isError) return <QueryError error={query.error} onRetry={() => query.refetch()} />;
  if (query.isLoading) return <InlineLoading label="Se încarcă mesajele trimise…" />;

  const messages = query.data?.messages ?? [];
  if (!messages.length) {
    return (
      <EmptyState
        icon={Send}
        title="Niciun email trimis"
        description="Mesajele trimise din această căsuță vor apărea aici."
      />
    );
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
              <span className="block truncate text-sm text-muted-foreground">
                {m.subject || "(fără subiect)"}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              {deliveryBadge(m.delivery_status)}
              <span className="text-xs text-muted-foreground">
                {formatDateTime(m.sent_at ?? m.created_at)}
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={messages.length < 50}
          onClick={() => setPage(page + 1)}
        >
          Următor
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ciorne                                                             */
/* ------------------------------------------------------------------ */

function DraftsList({
  mailboxId,
  page,
  setPage,
  onEdit,
  onChanged,
}: {
  mailboxId: string | null;
  page: number;
  setPage: (p: number) => void;
  onEdit: (draft: MailMessage) => void;
  onChanged: () => void;
}) {
  const load = useServerFn(getMailMessages);
  const remove = useServerFn(deleteMailDraft);
  const [deleting, setDeleting] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["mail", "drafts", mailboxId, page],
    queryFn: () => load({ data: { mailboxId, direction: "outbound", status: "draft", page } }),
    enabled: !!mailboxId,
  });

  const drop = async (draftId: string) => {
    setDeleting(draftId);
    try {
      const res = await remove({ data: { draftId } });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Ciorna a fost ștearsă.");
        onChanged();
      }
    } finally {
      setDeleting(null);
    }
  };

  if (query.isError) return <QueryError error={query.error} onRetry={() => query.refetch()} />;
  if (query.isLoading) return <InlineLoading label="Se încarcă ciornele…" />;

  const drafts = query.data?.messages ?? [];
  if (!drafts.length) {
    return (
      <EmptyState
        icon={Mail}
        title="Nicio ciornă"
        description="Mesajele salvate din fereastra de compunere apar aici, pregătite pentru continuare."
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {drafts.map((d, i) => (
          <div
            key={d.id}
            className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-border")}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
              onClick={() => onEdit(d)}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Mail className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {d.to_emails.length ? `Către: ${d.to_emails.join(", ")}` : "Fără destinatar"}
                </span>
                <span className="block truncate text-sm text-muted-foreground">
                  {d.subject || "(fără subiect)"}
                </span>
                {d.text_body && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {d.text_body}
                  </span>
                )}
              </span>
            </button>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatDateTime(d.created_at)}
            </span>
            <Button variant="outline" size="sm" onClick={() => onEdit(d)}>
              Continuă
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Șterge ciorna"
              disabled={deleting === d.id}
              onClick={() => void drop(d.id)}
            >
              {deleting === d.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
              )}
            </Button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={drafts.length < 50}
          onClick={() => setPage(page + 1)}
        >
          Următor
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Conversație deschisă                                                */
/* ------------------------------------------------------------------ */

function ThreadView({
  threadId,
  onBack,
  onChanged,
}: {
  threadId: string;
  onBack: () => void;
  onChanged: () => void;
}) {
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
      toast.success(
        status === "open"
          ? "Conversația a fost redeschisă."
          : status === "archived"
            ? "Conversația a fost arhivată."
            : "Conversația a fost mutată în spam.",
      );
      onChanged();
      onBack();
    }
  };

  const downloadAttachment = async (attachmentId: string) => {
    const res = await getUrl({ data: { attachmentId } });
    if (res.error || !res.url) toast.error(res.error ?? "Linkul nu a putut fi generat.");
    else window.open(res.url, "_blank", "noopener");
  };

  if (query.isError) return <QueryError error={query.error} onRetry={() => query.refetch()} />;
  if (query.isLoading || !thread) return <InlineLoading label="Se încarcă conversația…" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Înapoi
        </Button>
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">
          {thread.subject || "(fără subiect)"}
        </h2>
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

      <ReplyBox
        threadId={threadId}
        onSent={() => {
          void query.refetch();
          onChanged();
        }}
      />
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
  const [showImages, setShowImages] = useState(false);
  const rendered = useMemo(
    () => (message.html_body ? sanitizeMailHtml(message.html_body, showImages) : null),
    [message.html_body, showImages],
  );
  const html = rendered?.html ?? null;
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
            {message.from_name
              ? `${message.from_name} <${message.from_email}>`
              : message.from_email}
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
        <>
          {!showImages && (rendered?.blocked ?? 0) > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <ImageOff className="h-3.5 w-3.5" />
              <span>
                {rendered!.blocked} imagini externe au fost blocate (pot semnala expeditorului că ai
                deschis mesajul).
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => setShowImages(true)}
              >
                Afișează imaginile
              </Button>
            </div>
          )}
          <div
            className="prose prose-sm max-w-none overflow-x-auto text-foreground [&_a]:text-accent-foreground [&_img]:max-w-full"
            // HTML sanitizat cu DOMPurify mai sus — singura cale de randare.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </>
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
              title={a.status !== "stored" ? (a.rejected_reason ?? "Indisponibil") : a.filename}
              onClick={() => onDownload(a.id)}
            >
              <Paperclip className="mr-1.5 h-3.5 w-3.5" />
              <span className="max-w-48 truncate">{a.filename}</span>
              <span className="ml-1 text-xs text-muted-foreground">
                ({Math.ceil(a.size_bytes / 1024)} KB)
              </span>
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
          data: {
            filename: file.name,
            contentType: file.type || "application/octet-stream",
            dataBase64,
          },
        });
        if (res.error || !res.upload)
          toast.error(res.error ?? `Fișierul ${file.name} nu a putut fi încărcat.`);
        else
          setItems((prev) => [
            ...prev,
            { id: res.upload!.id, filename: file.name, size: file.size },
          ]);
      }
    } finally {
      setUploading(false);
    }
  };

  return {
    items,
    uploading,
    addFiles,
    remove: (id: string) => setItems((p) => p.filter((i) => i.id !== id)),
    reset: () => setItems([]),
  };
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={staged.uploading}
          onClick={() => inputRef.current?.click()}
        >
          {staged.uploading ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Paperclip className="mr-1.5 h-4 w-4" />
          )}
          Atașează
        </Button>
        {staged.items.map((i) => (
          <span
            key={i.id}
            className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"
          >
            <span className="max-w-40 truncate">{i.filename}</span>
            <button
              type="button"
              aria-label={`Elimină ${i.filename}`}
              onClick={() => staged.remove(i.id)}
            >
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
          {sending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-1.5 h-4 w-4" />
          )}
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
  draft,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mailboxes: MailMailbox[];
  defaultMailboxId: string | null;
  /** Ciornă deschisă pentru continuare; `null` = email nou. */
  draft: MailMessage | null;
  onSent: () => void;
}) {
  const send = useServerFn(sendMail);
  const saveDraft = useServerFn(saveMailDraft);
  const dropDraft = useServerFn(deleteMailDraft);
  const [mailboxId, setMailboxId] = useState<string>("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const draftIdRef = useRef<string | null>(null);
  const staged = useStagedAttachments();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const sendKeyRef = useRef(crypto.randomUUID());

  useEffect(() => {
    if (open) {
      setMailboxId(
        (mailboxes.find((m) => m.id === (draft?.mailbox_id ?? defaultMailboxId)) ?? mailboxes[0])
          ?.id ?? "",
      );
      setTo(draft?.to_emails.join(", ") ?? "");
      setCc(draft?.cc_emails.join(", ") ?? "");
      setSubject(draft?.subject ?? "");
      setText(draft?.text_body ?? "");
      draftIdRef.current = draft?.id ?? null;
      sendKeyRef.current = crypto.randomUUID();
    }
  }, [open, mailboxes, defaultMailboxId, draft]);

  const split = (value: string) =>
    value
      .split(/[;,]/)
      .map((s) => s.trim())
      .filter(Boolean);

  const submit = async () => {
    const recipients = split(to);
    if (!mailboxId) {
      toast.error("Alege căsuța expeditor.");
      return;
    }
    if (!recipients.length) {
      toast.error("Adaugă cel puțin un destinatar.");
      return;
    }
    if (!subject.trim()) {
      toast.error("Adaugă un subiect.");
      return;
    }
    if (!text.trim() && !staged.items.length) {
      toast.error("Scrie un mesaj sau atașează un fișier.");
      return;
    }

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
      // Ciorna a devenit un mesaj trimis, deci nu mai are ce căuta în dosar.
      if (draftIdRef.current) {
        await dropDraft({ data: { draftId: draftIdRef.current } });
        draftIdRef.current = null;
      }
      toast.success("Email trimis.");
      setTo("");
      setCc("");
      setSubject("");
      setText("");
      staged.reset();
      onSent();
    } finally {
      setSending(false);
    }
  };

  const keepAsDraft = async () => {
    if (!mailboxId) {
      toast.error("Alege căsuța expeditor.");
      return;
    }
    setSavingDraft(true);
    try {
      const res = await saveDraft({
        data: {
          draftId: draftIdRef.current,
          mailboxId,
          to: split(to),
          cc: split(cc),
          subject: subject.trim(),
          text: text.trim() || null,
        },
      });
      if (res.error || !res.draftId) {
        toast.error(res.error ?? "Ciorna nu a putut fi salvată.");
        return;
      }
      draftIdRef.current = res.draftId;
      toast.success("Ciorna a fost salvată.");
      onSent();
    } finally {
      setSavingDraft(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{draft ? "Continuă ciorna" : "Email nou"}</DialogTitle>
          <DialogDescription>Trimite un email dintr-o căsuță a platformei.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>De la</Label>
              <Select value={mailboxId} onValueChange={setMailboxId}>
                <SelectTrigger>
                  <SelectValue placeholder="Alege căsuța" />
                </SelectTrigger>
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
              <Input
                id="compose-to"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="client@exemplu.ro, alt@exemplu.ro"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="compose-cc">CC (opțional)</Label>
              <Input
                id="compose-cc"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="coleg@exemplu.ro"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="compose-subject">Subiect</Label>
              <Input
                id="compose-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subiectul emailului"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="compose-body">Mesaj</Label>
            <Textarea
              id="compose-body"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder="Scrie mesajul…"
            />
          </div>
          <AttachmentPicker staged={staged} inputRef={fileRef} />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sending || savingDraft}
          >
            Renunță
          </Button>
          <Button variant="outline" onClick={keepAsDraft} disabled={sending || savingDraft}>
            {savingDraft ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-1.5 h-4 w-4" />
            )}
            Salvează ciorna
          </Button>
          <Button onClick={submit} disabled={sending || savingDraft}>
            {sending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-4 w-4" />
            )}
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
    if (!address.trim()) {
      toast.error("Adaugă adresa de email.");
      return;
    }
    setSaving(true);
    try {
      const res = await create({
        data: {
          address: address.trim(),
          displayName: displayName.trim() || null,
          scope: "platform",
          isActive: true,
        },
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Căsuța a fost creată.");
        setAddress("");
        setDisplayName("");
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
            Adresele de pe care platforma trimite și primește emailuri. Fiecare adresă trebuie să
            existe și în Mailgun.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {mailboxes.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.address}</p>
                {m.display_name && (
                  <p className="truncate text-xs text-muted-foreground">{m.display_name}</p>
                )}
              </div>
              <Badge variant="outline" className="text-[11px]">
                {m.scope === "platform" ? "Platformă" : "Agenție"}
              </Badge>
              <Switch
                checked={m.is_active}
                onCheckedChange={(v) => toggle(m, v)}
                aria-label={`Activează ${m.address}`}
              />
            </div>
          ))}
          {!mailboxes.length && (
            <p className="text-sm text-muted-foreground">Nicio căsuță configurată încă.</p>
          )}
        </div>

        <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
          <p className="text-sm font-medium">Căsuță nouă</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mb-address">Adresă</Label>
              <Input
                id="mb-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="contact@domeniu.ro"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mb-name">Nume afișat (opțional)</Label>
              <Input
                id="mb-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Habitoo"
              />
            </div>
          </div>
          <Button size="sm" onClick={add} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1.5 h-4 w-4" />
            )}
            Adaugă căsuța
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
