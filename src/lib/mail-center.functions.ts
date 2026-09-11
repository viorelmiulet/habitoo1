/**
 * Mail Center — Superadmin server functions (phase 1: infrastructure API).
 *
 * Every function authorizes the caller through `is_superadmin()` BEFORE the
 * service-role client is loaded, so nothing privileged runs for a signed-in
 * agency user. The service-role client is imported inside the handler only.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isEmail, normalizeRecipient } from "@/lib/mailgun";
import {
  attachmentUrl,
  countThreads,
  listMailboxes,
  listMessageEvents,
  listMessages,
  listThreads,
  mailStatus,
  readThread,
} from "@/lib/mail-center.server";
import {
  THREAD_STATUSES,
  createMailbox as createMailboxMutation,
  deleteDraft as deleteDraftMutation,
  markThreadRead,
  replyToThread as replyToThreadMutation,
  saveDraft as saveDraftMutation,
  sendMailboxMessage,
  setThreadStatus,
  updateMailbox as updateMailboxMutation,
} from "@/lib/mail-center-admin.server";
import { stageOutboundAttachment } from "@/lib/mail-outbound.server";

const DENIED = "Acces refuzat: acțiunea este permisă exclusiv superadminului.";

/** Authorization first, privileged client second — never the other way round. */
async function admin(context: { supabase: { rpc: (fn: string) => Promise<{ data: unknown; error: unknown }> } }) {
  const { data, error } = await context.supabase.rpc("is_superadmin");
  if (error || data !== true) throw new Error(DENIED);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const uuid = z.string().uuid();

/* ------------------------------------------------------------------ */
/* Status & mailboxes                                                  */
/* ------------------------------------------------------------------ */

export const getMailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await admin(context as never);
    return mailStatus();
  });

export const getMailboxes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin(context as never);
    return { mailboxes: await listMailboxes(db), status: mailStatus() };
  });

export const createMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        address: z.string().min(3).max(320),
        displayName: z.string().max(120).nullable().optional(),
        scope: z.enum(["platform", "agency"]).default("platform"),
        organizationId: uuid.nullable().optional(),
        isActive: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await admin(context as never);
    return createMailboxMutation(db, {
      address: data.address,
      displayName: data.displayName ?? null,
      scope: data.scope,
      organizationId: data.organizationId ?? null,
      isActive: data.isActive,
    });
  });

export const updateMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        mailboxId: uuid,
        address: z.string().min(3).max(320).nullable().optional(),
        displayName: z.string().max(120).nullable().optional(),
        isActive: z.boolean().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await admin(context as never);
    return updateMailboxMutation(db, data);
  });

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

export const getThreads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        mailboxId: uuid.nullable().optional(),
        status: z.enum(THREAD_STATUSES).default("open"),
        page: z.number().int().min(0).max(500).default(0),
        unreadOnly: z.boolean().optional(),
        hasAttachments: z.boolean().nullable().optional(),
        q: z.string().max(200).nullable().optional(),
        from: z.string().datetime().nullable().optional(),
        to: z.string().datetime().nullable().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const db = await admin(context as never);
    const filters = {
      mailboxId: data.mailboxId ?? null,
      status: data.status,
      ...(data.unreadOnly === undefined ? {} : { unreadOnly: data.unreadOnly }),
      hasAttachments: data.hasAttachments ?? null,
      q: data.q ?? null,
      from: data.from ?? null,
      to: data.to ?? null,
    };
    const [threads, total] = await Promise.all([
      listThreads(db, { ...filters, page: data.page }),
      countThreads(db, filters),
    ]);
    return { threads, total };
  });

/* ------------------------------------------------------------------ */
/* Drafts                                                             */
/* ------------------------------------------------------------------ */

export const saveMailDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        draftId: uuid.nullable().optional(),
        mailboxId: uuid,
        to: z.array(z.string().max(320)).max(20).default([]),
        cc: z.array(z.string().max(320)).max(20).default([]),
        subject: z.string().max(300).default(""),
        text: z.string().max(200_000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await admin(context as never);
    return saveDraftMutation(db, {
      draftId: data.draftId ?? null,
      mailboxId: data.mailboxId,
      to: data.to,
      cc: data.cc,
      subject: data.subject,
      text: data.text ?? null,
    });
  });

export const deleteMailDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ draftId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await admin(context as never);
    return deleteDraftMutation(db, data.draftId);
  });

export const getThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ threadId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await admin(context as never);
    return readThread(db, data.threadId);
  });

export const getMailMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        mailboxId: uuid.nullable().optional(),
        direction: z.enum(["inbound", "outbound"]).optional(),
        status: z.enum(["draft", "queued", "sent", "received", "failed"]).optional(),
        page: z.number().int().min(0).max(500).default(0),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const db = await admin(context as never);
    return {
      messages: await listMessages(db, {
        mailboxId: data.mailboxId ?? null,
        ...(data.direction ? { direction: data.direction } : {}),
        ...(data.status ? { status: data.status } : {}),
        page: data.page,
      }),
    };
  });

export const getMessageEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ messageId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await admin(context as never);
    return { events: await listMessageEvents(db, data.messageId) };
  });

export const getAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ attachmentId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await admin(context as never);
    return attachmentUrl(db, data.attachmentId);
  });

/* ------------------------------------------------------------------ */
/* Thread state                                                        */
/* ------------------------------------------------------------------ */

export const setMailThreadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ threadId: uuid, status: z.enum(THREAD_STATUSES) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await admin(context as never);
    return setThreadStatus(db, data.threadId, data.status);
  });

export const setMailThreadRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ threadId: uuid, read: z.boolean().default(true) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await admin(context as never);
    return markThreadRead(db, data.threadId, data.read);
  });

/* ------------------------------------------------------------------ */
/* Outbound                                                            */
/* ------------------------------------------------------------------ */

const recipients = z
  .array(z.string().min(3).max(320))
  .min(1)
  .max(20)
  .transform((list) => list.map(normalizeRecipient).filter((v): v is string => !!v && isEmail(v)));

export const uploadMailAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        filename: z.string().min(1).max(255),
        contentType: z.string().min(3).max(180),
        // ~13.4 MB of base64 covers the 10 MB per-file cap.
        dataBase64: z.string().min(1).max(14_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await admin(context as never);
    return stageOutboundAttachment(db, context.userId, data);
  });

export const sendMail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        mailboxId: uuid,
        to: recipients,
        cc: z.array(z.string().min(3).max(320)).max(20).optional(),
        subject: z.string().min(1).max(300),
        text: z.string().max(200_000).nullable().optional(),
        html: z.string().max(400_000).nullable().optional(),
        threadId: uuid.nullable().optional(),
        /** Client-generated idempotency key; a retry never sends twice. */
        sendKey: z.string().min(8).max(120),
        attachmentIds: z.array(uuid).max(20).optional(),
        replyTo: z.string().max(320).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await admin(context as never);

    // Sender/recipient rules (From allowlist included) are enforced once, in
    // `sendMailboxEmail` — never duplicated here.
    return sendMailboxMessage(db, {
      mailboxId: data.mailboxId,
      to: data.to,
      cc: (data.cc ?? []).map(normalizeRecipient).filter((v): v is string => !!v && isEmail(v)),
      subject: data.subject,

      text: data.text ?? null,
      html: data.html ?? null,
      threadId: data.threadId ?? null,
      sendKey: data.sendKey,
      attachmentIds: data.attachmentIds ?? [],
      replyTo: data.replyTo ?? null,
      actorId: context.userId,
    });
  });

export const replyMail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        threadId: uuid,
        text: z.string().max(200_000).nullable().optional(),
        html: z.string().max(400_000).nullable().optional(),
        to: z.array(z.string().min(3).max(320)).max(20).optional(),
        sendKey: z.string().min(8).max(120),
        attachmentIds: z.array(uuid).max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await admin(context as never);
    return replyToThreadMutation(db, {
      threadId: data.threadId,
      text: data.text ?? null,
      html: data.html ?? null,
      ...(data.to ? { to: data.to.map(normalizeRecipient).filter((v): v is string => !!v && isEmail(v)) } : {}),
      sendKey: data.sendKey,
      attachmentIds: data.attachmentIds ?? [],
      actorId: context.userId,
    });
  });
