/**
 * Mail Center — server-only mutations behind the SuperAdmin server functions.
 *
 * The caller is authorized before these run (they receive the service-role
 * client from `requireSuperAdmin`). Thread counters are NEVER written here:
 * the `email_messages_thread_meta` database trigger owns `last_message_at`,
 * `last_direction`, `message_count` and `unread_count`, so inbound, outbound
 * and replies all keep the thread consistent through one single code path.
 */
import { isEmail, normalizeRecipient, normalizeSubject } from "@/lib/mailgun";
import { sendMailboxEmail } from "@/lib/mailgun.server";
import { loadStagedAttachments, persistOutboundAttachments } from "@/lib/mail-outbound.server";
import { resolveThread } from "@/lib/mail-threading.server";
import type { MailMailbox } from "@/lib/mail-center.server";

type Db = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export const THREAD_STATUSES = ["open", "archived", "spam"] as const;
export type ThreadStatus = (typeof THREAD_STATUSES)[number];

const MAILBOX_COLUMNS = "id, address, display_name, scope, organization_id, is_active";

/* ------------------------------------------------------------------ */
/* Mailbox administration                                              */
/* ------------------------------------------------------------------ */

export type MailboxInput = {
  address: string;
  displayName: string | null;
  scope: "platform" | "agency";
  organizationId: string | null;
  isActive: boolean;
};

/**
 * Creates a mailbox. Nothing is ever auto-provisioned with an invented
 * address: a mailbox exists only because an administrator configured it.
 */
export async function createMailbox(
  db: Db,
  input: MailboxInput,
): Promise<{ mailbox: MailMailbox | null; error: string | null }> {
  const address = normalizeRecipient(input.address);
  if (!address || !isEmail(address)) return { mailbox: null, error: "Adresă de email invalidă." };

  // Scope and tenant must agree; an agency mailbox without an agency (or a
  // platform mailbox carrying one) would silently break tenant filtering.
  if (input.scope === "agency" && !input.organizationId) {
    return { mailbox: null, error: "Căsuța de agenție necesită o agenție." };
  }
  const organizationId = input.scope === "agency" ? input.organizationId : null;

  if (organizationId) {
    const { data: agency } = await db.from("organizations").select("id").eq("id", organizationId).maybeSingle();
    if (!agency) return { mailbox: null, error: "Agenția nu există." };
  }

  const { data, error } = await db
    .from("mailboxes")
    .insert({
      address,
      display_name: input.displayName?.trim() || null,
      scope: input.scope,
      organization_id: organizationId,
      is_active: input.isActive,
    })
    .select(MAILBOX_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") return { mailbox: null, error: "Adresa este deja configurată." };
    console.error("[mail:mailbox] create failed", { code: error.code });
    return { mailbox: null, error: "Căsuța nu a putut fi creată." };
  }
  return { mailbox: data as MailMailbox, error: null };
}

/**
 * Updates the editable fields only. `scope` and `organization_id` are immutable:
 * moving a mailbox between tenants would move its whole history with it.
 */
export async function updateMailbox(
  db: Db,
  input: { mailboxId: string; address?: string | null; displayName?: string | null; isActive?: boolean | null },
): Promise<{ mailbox: MailMailbox | null; error: string | null }> {
  const patch: { address?: string; display_name?: string | null; is_active?: boolean } = {};

  if (input.address !== undefined && input.address !== null) {
    const address = normalizeRecipient(input.address);
    if (!address || !isEmail(address)) return { mailbox: null, error: "Adresă de email invalidă." };
    patch["address"] = address;
  }
  if (input.displayName !== undefined) patch["display_name"] = input.displayName?.trim() || null;
  if (input.isActive !== undefined && input.isActive !== null) patch["is_active"] = input.isActive;

  if (!Object.keys(patch).length) return { mailbox: null, error: "Nimic de actualizat." };

  const { data, error } = await db
    .from("mailboxes")
    .update(patch)
    .eq("id", input.mailboxId)
    .select(MAILBOX_COLUMNS)
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return { mailbox: null, error: "Adresa este deja configurată." };
    console.error("[mail:mailbox] update failed", { code: error.code });
    return { mailbox: null, error: "Căsuța nu a putut fi actualizată." };
  }
  if (!data) return { mailbox: null, error: "Căsuța nu există." };
  return { mailbox: data as MailMailbox, error: null };
}

export async function setMailboxActive(
  db: Db,
  mailboxId: string,
  isActive: boolean,
): Promise<{ mailbox: MailMailbox | null; error: string | null }> {
  return updateMailbox(db, { mailboxId, isActive });
}

/* ------------------------------------------------------------------ */
/* Thread state                                                        */
/* ------------------------------------------------------------------ */

/** Only the three states the schema already defines. */
export async function setThreadStatus(
  db: Db,
  threadId: string,
  status: ThreadStatus,
): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await db
    .from("email_threads")
    .update({ status })
    .eq("id", threadId)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[mail:thread] status failed", { code: error.code });
    return { ok: false, error: "Starea conversației nu a putut fi schimbată." };
  }
  if (!data) return { ok: false, error: "Conversația nu există." };
  return { ok: true, error: null };
}

/**
 * Marks the inbound messages of a thread as read. The counters are recomputed
 * by the database trigger, so `unread_count` can never drift from the rows.
 */
export async function markThreadRead(
  db: Db,
  threadId: string,
  read = true,
): Promise<{ ok: boolean; unreadCount: number; error: string | null }> {
  const { data: thread } = await db
    .from("email_threads")
    .select("id")
    .eq("id", threadId)
    .maybeSingle();
  if (!thread) return { ok: false, unreadCount: 0, error: "Conversația nu există." };

  const { error } = await db
    .from("email_messages")
    .update({ is_read: read })
    .eq("thread_id", threadId)
    .eq("direction", "inbound")
    .eq("is_read", !read);
  if (error) {
    console.error("[mail:thread] mark read failed", { code: error.code });
    return { ok: false, unreadCount: 0, error: "Conversația nu a putut fi actualizată." };
  }

  const { data: refreshed } = await db
    .from("email_threads")
    .select("unread_count")
    .eq("id", threadId)
    .maybeSingle();
  return { ok: true, unreadCount: refreshed?.unread_count ?? 0, error: null };
}

/* ------------------------------------------------------------------ */
/* Outbound                                                            */
/* ------------------------------------------------------------------ */

export type SendInput = {
  mailboxId: string;
  to: string[];
  cc?: string[];
  subject: string;
  text?: string | null;
  html?: string | null;
  threadId?: string | null;
  sendKey: string;
  /** Ids returned by `uploadMailAttachment`; ownership is re-checked. */
  attachmentIds?: string[];
  /**
   * Optional Reply-To. Only an address the platform itself owns is accepted;
   * an arbitrary value would let a reply be redirected off-platform.
   */
  replyTo?: string | null;

  /** SuperAdmin performing the send — owns the staged uploads. */
  actorId: string;
};

export type SendOutcome = {
  ok: boolean;
  messageId: string | null;
  threadId: string | null;
  duplicate: boolean;
  attachmentCount: number;
  error: string | null;
};

const EMPTY_OUTCOME = { messageId: null, threadId: null, duplicate: false, attachmentCount: 0 };

async function activeMailbox(db: Db, mailboxId: string) {
  const { data } = await db
    .from("mailboxes")
    .select("id, address, display_name, is_active")
    .eq("id", mailboxId)
    .maybeSingle();
  if (!data) return { mailbox: null, error: "Căsuța nu există." } as const;
  if (!data.is_active) return { mailbox: null, error: "Căsuța este dezactivată." } as const;
  return { mailbox: data, error: null } as const;
}

/** Composes a NEW message from a mailbox (no thread continuation implied). */
export async function sendMailboxMessage(db: Db, input: SendInput): Promise<SendOutcome> {
  const { mailbox, error } = await activeMailbox(db, input.mailboxId);
  if (!mailbox) return { ok: false, ...EMPTY_OUTCOME, error };

  // Reply-To may only point at another platform mailbox — never a free address.
  let replyTo = mailbox.address;
  const requested = input.replyTo?.trim().toLowerCase();
  if (requested && requested !== mailbox.address.toLowerCase()) {
    const { data: owned } = await db
      .from("mailboxes")
      .select("address")
      .eq("address", requested)
      .maybeSingle();
    if (!owned) {
      return { ok: false, ...EMPTY_OUTCOME, error: "Adresa de răspuns nu este permisă." };
    }
    replyTo = owned.address;
  }

  const loaded = await loadStagedAttachments(db, input.actorId, input.attachmentIds ?? []);
  if (!loaded.ok) return { ok: false, ...EMPTY_OUTCOME, error: loaded.error };

  // The conversation exists BEFORE the message is persisted, so an outbound
  // first message is never orphaned and the inbound reply joins the same row.
  const threadId =
    input.threadId ??
    (await resolveThread(db, {
      mailboxId: mailbox.id,
      subject: input.subject,
      counterpart: input.to[0] ?? null,
      participants: [mailbox.address, ...input.to, ...(input.cc ?? [])],
    }));
  if (!threadId) return { ok: false, ...EMPTY_OUTCOME, error: "Conversația nu a putut fi creată." };

  const result = await sendMailboxEmail({
    mailboxId: mailbox.id,
    threadId,
    from: mailbox.display_name ? `${mailbox.display_name} <${mailbox.address}>` : mailbox.address,
    to: input.to,
    cc: input.cc ?? [],
    replyTo,

    subject: input.subject,
    text: input.text ?? null,
    html: input.html ?? null,
    sendKey: input.sendKey,
    attachments: loaded.items.map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
      data: a.data,
    })),
  });

  if (!result.ok) {
    // Nothing was written for the attachments, so the staged files stay
    // untouched and a retry with the same `send_key` remains safe.
    return { ok: false, ...EMPTY_OUTCOME, error: result.error };
  }

  // A duplicate already carries its attachments; re-persisting would double them.
  const persisted =
    result.duplicate || !loaded.items.length
      ? { stored: 0 }
      : await persistOutboundAttachments(db, result.messageId, loaded.items);

  return {
    ok: true,
    messageId: result.messageId,
    threadId,
    duplicate: result.duplicate,
    attachmentCount: persisted.stored,
    error: null,
  };
}


/**
 * Replies inside an existing thread.
 *
 * Threading is derived from the thread's own last message — never re-derived
 * from the subject — so the reply keeps `In-Reply-To` / `References` pointing
 * at the real parent and stays attached to the SAME `email_threads` row.
 */
export async function replyToThread(
  db: Db,
  input: {
    threadId: string;
    text?: string | null;
    html?: string | null;
    sendKey: string;
    to?: string[];
    attachmentIds?: string[];
    actorId: string;
  },
): Promise<SendOutcome> {
  const { data: thread } = await db
    .from("email_threads")
    .select("id, mailbox_id, subject, participants")
    .eq("id", input.threadId)
    .maybeSingle();
  if (!thread) {
    return { ok: false, ...EMPTY_OUTCOME, error: "Conversația nu există." };
  }

  const { mailbox, error } = await activeMailbox(db, thread.mailbox_id);
  if (!mailbox) return { ok: false, ...EMPTY_OUTCOME, threadId: thread.id, error };

  // The parent is the most recent message with a usable provider id; an
  // inbound message is preferred because that is who we are answering.
  const { data: history } = await db
    .from("email_messages")
    .select("id, direction, from_email, to_emails, cc_emails, reply_to, subject, provider_message_id, in_reply_to, message_references, created_at")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const messages = history ?? [];
  const parent = messages.find((m) => m.direction === "inbound" && m.provider_message_id) ?? messages[0];
  if (!parent) {
    return { ok: false, ...EMPTY_OUTCOME, threadId: thread.id, error: "Conversația nu are mesaje." };
  }

  const recipients = input.to?.length
    ? input.to
    : parent.direction === "inbound"
      ? [parent.reply_to ?? parent.from_email]
      : parent.to_emails;
  const to = (recipients ?? []).filter((v): v is string => !!v);
  if (!to.length) {
    return { ok: false, ...EMPTY_OUTCOME, threadId: thread.id, error: "Nu există destinatar." };
  }

  // Same staging/validation path as compose — one implementation, not two.
  const loaded = await loadStagedAttachments(db, input.actorId, input.attachmentIds ?? []);
  if (!loaded.ok) return { ok: false, ...EMPTY_OUTCOME, threadId: thread.id, error: loaded.error };

  const parentId = parent.provider_message_id ?? parent.in_reply_to ?? null;
  const references = Array.from(
    new Set([...(parent.message_references ?? []), ...(parentId ? [parentId] : [])]),
  ).slice(-20);

  const base = normalizeSubject(parent.subject ?? thread.subject ?? "");
  const subject = base ? `Re: ${base}` : "Re:";

  const result = await sendMailboxEmail({
    mailboxId: mailbox.id,
    threadId: thread.id,
    from: mailbox.display_name ? `${mailbox.display_name} <${mailbox.address}>` : mailbox.address,
    to,
    cc: [],
    replyTo: mailbox.address,
    subject,
    text: input.text ?? null,
    html: input.html ?? null,
    inReplyTo: parentId,
    references,
    sendKey: input.sendKey,
    attachments: loaded.items.map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
      data: a.data,
    })),
  });

  if (!result.ok) {
    return { ok: false, ...EMPTY_OUTCOME, threadId: thread.id, error: result.error };
  }

  const persisted =
    result.duplicate || !loaded.items.length
      ? { stored: 0 }
      : await persistOutboundAttachments(db, result.messageId, loaded.items);

  return {
    ok: true,
    messageId: result.messageId,
    threadId: thread.id,
    duplicate: result.duplicate,
    attachmentCount: persisted.stored,
    error: null,
  };

}

/* ------------------------------------------------------------------ */
/* Drafts                                                             */
/* ------------------------------------------------------------------ */

export type DraftInput = {
  draftId?: string | null;
  mailboxId: string;
  to: string[];
  cc: string[];
  subject: string;
  text: string | null;
};

/**
 * Creates or updates a draft. A draft is an `email_messages` row with
 * `status = 'draft'` and no thread, so it never touches thread counters and can
 * never be mistaken for something already sent.
 */
export async function saveDraft(
  db: Db,
  input: DraftInput,
): Promise<{ draftId: string | null; error: string | null }> {
  const { mailbox, error } = await activeMailbox(db, input.mailboxId);
  if (!mailbox) return { draftId: null, error };

  const to = input.to.map(normalizeRecipient).filter((v): v is string => !!v && isEmail(v));
  const cc = input.cc.map(normalizeRecipient).filter((v): v is string => !!v && isEmail(v));
  const subject = input.subject.trim().slice(0, 300) || null;
  const text = input.text?.trim() || null;

  if (!to.length && !subject && !text) return { draftId: null, error: "Ciorna este goală." };

  const row = {
    mailbox_id: mailbox.id,
    thread_id: null,
    direction: "outbound",
    status: "draft",
    delivery_status: "queued",
    from_email: mailbox.address,
    from_name: mailbox.display_name ?? null,
    to_emails: to,
    cc_emails: cc,
    subject,
    text_body: text,
    is_read: true,
  };

  if (input.draftId) {
    const { data, error: updateError } = await db
      .from("email_messages")
      .update(row)
      .eq("id", input.draftId)
      .eq("status", "draft")
      .select("id")
      .maybeSingle();
    if (updateError) {
      console.error("[mail:draft] update failed", { code: updateError.code });
      return { draftId: null, error: "Ciorna nu a putut fi salvată." };
    }
    if (!data) return { draftId: null, error: "Ciorna nu există." };
    return { draftId: data.id, error: null };
  }

  const { data, error: insertError } = await db
    .from("email_messages")
    .insert(row)
    .select("id")
    .single();
  if (insertError) {
    console.error("[mail:draft] insert failed", { code: insertError.code });
    return { draftId: null, error: "Ciorna nu a putut fi salvată." };
  }
  return { draftId: data.id, error: null };
}

/** Deletes a draft. The guard on `status` keeps sent mail undeletable. */
export async function deleteDraft(
  db: Db,
  draftId: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await db
    .from("email_messages")
    .delete()
    .eq("id", draftId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[mail:draft] delete failed", { code: error.code });
    return { ok: false, error: "Ciorna nu a putut fi ștearsă." };
  }
  if (!data) return { ok: false, error: "Ciorna nu există." };
  return { ok: true, error: null };
}
