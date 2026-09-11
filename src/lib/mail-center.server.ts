/**
 * Mail Center — server-only queries behind the Superadmin server functions.
 *
 * The caller is already authorized when these run; they receive the
 * service-role client. Kept out of the `*.functions.ts` module so nothing but
 * exported server functions lives there.
 */
import { threadPreview } from "@/lib/mailgun";
import { getMailgunStatus, type MailgunConfigStatus } from "@/lib/mailgun.server";

type Db = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

const PAGE_SIZE = 50;
const ATTACHMENT_BUCKET = "mail-attachments";
const SIGNED_URL_SECONDS = 120;

export type MailMailbox = {
  id: string;
  address: string;
  display_name: string | null;
  scope: string;
  organization_id: string | null;
  is_active: boolean;
};

export type MailThread = {
  id: string;
  mailbox_id: string;
  subject: string | null;
  participants: string[];
  message_count: number;
  unread_count: number;
  last_message_at: string | null;
  last_direction: string | null;
  status: string;
};

/** Thread + list-only extras (preview, attachment flag) from ONE query. */
export type MailThreadListItem = MailThread & {
  preview: string;
  has_attachments: boolean;
};

export type MailMessage = {
  id: string;
  mailbox_id: string;
  thread_id: string | null;
  direction: string;
  status: string;
  delivery_status: string;
  from_email: string;
  from_name: string | null;
  to_emails: string[];
  cc_emails: string[];
  reply_to: string | null;
  subject: string | null;
  text_body: string | null;
  /** Raw provider HTML: the UI MUST sanitize before rendering. */
  html_body: string | null;
  stripped_text: string | null;
  has_attachments: boolean;
  sent_at: string | null;
  received_at: string | null;
  delivered_at: string | null;
  last_error: string | null;
  created_at: string;
};

export type MailAttachment = {
  id: string;
  message_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  status: string;
  rejected_reason: string | null;
};

export type MailEvent = {
  id: string;
  event_type: string;
  message_id: string | null;
  severity: string | null;
  reason: string | null;
  error_code: string | null;
  occurred_at: string | null;
  received_at: string;
};

export function mailStatus(): MailgunConfigStatus {
  return getMailgunStatus();
}

export async function listMailboxes(db: Db): Promise<MailMailbox[]> {
  const { data } = await db
    .from("mailboxes")
    .select("id, address, display_name, scope, organization_id, is_active")
    .order("address");
  return (data ?? []) as MailMailbox[];
}

type ThreadListRow = MailThread & {
  last_stripped_text: string | null;
  last_text_body: string | null;
  last_has_html: boolean | null;
  has_attachments: boolean | null;
};

export type ThreadFilters = {
  mailboxId: string | null;
  status: string;
  unreadOnly?: boolean;
  hasAttachments?: boolean | null;
  /** Free text over sender, recipients, subject and body. */
  q?: string | null;
  from?: string | null;
  to?: string | null;
};

/**
 * One round trip for the whole page: the `mail_thread_search` SQL function joins
 * the LAST message (the one that also drives `last_message_at`/`last_direction`)
 * and an EXISTS over attachments laterally, and applies the search term plus the
 * date range in the same statement. No per-thread follow-up query, so the list
 * stays O(1) requests whatever the page size.
 */
export async function listThreads(
  db: Db,
  input: ThreadFilters & { page: number },
): Promise<MailThreadListItem[]> {
  const { data, error } = await db.rpc("mail_thread_search", {
    _mailbox_id: input.mailboxId,
    _status: input.status,
    _limit: PAGE_SIZE,
    _offset: input.page * PAGE_SIZE,
    _q: input.q?.trim() || null,
    _from: input.from ?? null,
    _to: input.to ?? null,
    _unread_only: input.unreadOnly === true,
    _has_attachments: input.hasAttachments ?? null,
  } as never);

  if (error) {
    console.error("[mail:threads] list failed", { code: error.code });
    return [];
  }

  return ((data ?? []) as unknown as ThreadListRow[]).map((row) => ({
    id: row.id,
    mailbox_id: row.mailbox_id,
    subject: row.subject,
    participants: row.participants ?? [],
    message_count: row.message_count,
    unread_count: row.unread_count,
    last_message_at: row.last_message_at,
    last_direction: row.last_direction,
    status: row.status,
    preview: threadPreview({
      strippedText: row.last_stripped_text,
      textBody: row.last_text_body,
      hasHtml: row.last_has_html,
    }),
    has_attachments: row.has_attachments === true,
  }));
}

const MESSAGE_COLUMNS =
  "id, mailbox_id, thread_id, direction, status, delivery_status, from_email, from_name, to_emails, cc_emails, reply_to, subject, text_body, html_body, stripped_text, has_attachments, sent_at, received_at, delivered_at, last_error, created_at";

/** Thread + its messages + their attachments, in three queries, never N+1. */
export async function readThread(
  db: Db,
  threadId: string,
): Promise<{
  thread: MailThread | null;
  messages: MailMessage[];
  attachments: MailAttachment[];
}> {
  const { data: thread } = await db
    .from("email_threads")
    .select(
      "id, mailbox_id, subject, participants, message_count, unread_count, last_message_at, last_direction, status",
    )
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) return { thread: null, messages: [], attachments: [] };

  const { data: messages } = await db
    .from("email_messages")
    .select(MESSAGE_COLUMNS)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(500);

  const rows = (messages ?? []) as MailMessage[];
  const ids = rows.filter((m) => m.has_attachments).map((m) => m.id);

  let attachments: MailAttachment[] = [];
  if (ids.length) {
    const { data } = await db
      .from("email_attachments")
      .select("id, message_id, filename, content_type, size_bytes, status, rejected_reason")
      .in("message_id", ids)
      .order("created_at", { ascending: true });
    attachments = (data ?? []) as MailAttachment[];
  }

  return { thread: thread as MailThread, messages: rows, attachments };
}

/** Messages of a mailbox by direction — powers "Sent" and "Drafts". */
export async function listMessages(
  db: Db,
  input: { mailboxId: string | null; direction?: "inbound" | "outbound"; status?: string; page: number },
): Promise<MailMessage[]> {
  let query = db
    .from("email_messages")
    .select(MESSAGE_COLUMNS)
    .order("created_at", { ascending: false })
    .range(input.page * PAGE_SIZE, input.page * PAGE_SIZE + PAGE_SIZE - 1);

  if (input.mailboxId) query = query.eq("mailbox_id", input.mailboxId);
  if (input.direction) query = query.eq("direction", input.direction);
  if (input.status) query = query.eq("status", input.status);

  const { data, error } = await query;
  if (error) {
    console.error("[mail:messages] list failed", { code: error.code });
    return [];
  }
  return (data ?? []) as MailMessage[];
}

/** Total for the SAME filters as `listThreads`, so paging never lies. */
export async function countThreads(db: Db, input: ThreadFilters): Promise<number> {
  const { data, error } = await db.rpc("mail_thread_search_count", {
    _mailbox_id: input.mailboxId,
    _status: input.status,
    _q: input.q?.trim() || null,
    _from: input.from ?? null,
    _to: input.to ?? null,
    _unread_only: input.unreadOnly === true,
    _has_attachments: input.hasAttachments ?? null,
  } as never);
  if (error) {
    console.error("[mail:threads] count failed", { code: error.code });
    return 0;
  }
  return Number(data ?? 0);
}

/** Provider delivery history of one message (delivered, bounced, complained). */
export async function listMessageEvents(db: Db, messageId: string): Promise<MailEvent[]> {
  const { data } = await db
    .from("email_events")
    .select("id, event_type, message_id, severity, reason, error_code, occurred_at, received_at")
    .eq("message_id", messageId)
    .order("received_at", { ascending: false })
    .limit(50);
  return (data ?? []) as MailEvent[];
}

/**
 * Short-lived signed URL for a stored attachment. The bucket stays private, so
 * a leaked link expires in two minutes and nothing is ever publicly listable.
 */
export async function attachmentUrl(
  db: Db,
  attachmentId: string,
): Promise<{ url: string | null; filename: string | null; error: string | null }> {
  const { data: row } = await db
    .from("email_attachments")
    .select("id, message_id, filename, storage_path, status")
    .eq("id", attachmentId)
    .maybeSingle();

  if (!row) return { url: null, filename: null, error: "Atașamentul nu există." };
  if (row.status !== "stored" || !row.storage_path) {
    return { url: null, filename: row.filename, error: "Atașamentul nu este disponibil." };
  }
  // The path is derived from ids only; a filename never reaches the path.
  if (row.storage_path !== `${row.message_id}/${row.id}`) {
    return { url: null, filename: row.filename, error: "Atașamentul nu este disponibil." };
  }

  const { data, error } = await db.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(row.storage_path, SIGNED_URL_SECONDS, { download: row.filename });

  if (error || !data?.signedUrl) {
    console.error("[mail:attachment] sign failed", { message: error?.message ?? null });
    return { url: null, filename: row.filename, error: "Linkul nu a putut fi generat." };
  }
  return { url: data.signedUrl, filename: row.filename, error: null };
}
