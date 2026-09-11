/**
 * Mail Center — thread resolution shared by the outbound sender and the
 * inbound webhook.
 *
 * Two rules only, no fuzzy matching:
 *  1. exact header linking — `In-Reply-To` / `References` are matched against
 *     `email_messages.provider_message_id` (and `message_id_header`), so a reply
 *     always lands on the thread of the message it answers;
 *  2. deterministic key fallback — `deriveThreadKey()` (subject + counterpart),
 *     resolved through `email_thread_upsert()`, whose `ON CONFLICT
 *     (mailbox_id, subject_key)` makes concurrent callers converge on ONE row
 *     instead of racing a SELECT-then-INSERT.
 */
import { deriveThreadKey, normalizeSubject, safeLogFields } from "@/lib/mailgun";

type Db = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/** Strips the angle brackets Mailgun/Gmail put around a Message-ID. */
function bareId(value: string | null | undefined): string | null {
  const v = (value ?? "").trim().replace(/^<|>$/g, "").toLowerCase();
  return v ? v : null;
}

/**
 * Exact header link: returns the thread of the message the given
 * `In-Reply-To`/`References` chain points at, or null when unknown.
 */
export async function findThreadByReferences(
  db: Db,
  mailboxId: string,
  ids: (string | null | undefined)[],
): Promise<string | null> {
  const candidates = Array.from(new Set(ids.map(bareId).filter((v): v is string => !!v))).slice(
    -20,
  );
  if (!candidates.length) return null;

  const { data } = await db
    .from("email_messages")
    .select("thread_id, provider_message_id, created_at")
    .eq("mailbox_id", mailboxId)
    .in("provider_message_id", candidates)
    .not("thread_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);

  return data?.[0]?.thread_id ?? null;
}

/**
 * Resolves the thread for a message, creating it atomically when needed.
 * `subjectKey` is derived, never guessed, and the upsert is the concurrency
 * boundary: two simultaneous sends of the same conversation get one thread.
 */
export async function resolveThread(
  db: Db,
  input: {
    mailboxId: string;
    subject: string | null;
    counterpart: string | null;
    participants: string[];
    inReplyTo?: string | null;
    references?: string[];
  },
): Promise<string | null> {
  const linked = await findThreadByReferences(db, input.mailboxId, [
    input.inReplyTo ?? null,
    ...(input.references ?? []),
  ]);
  if (linked) return linked;

  const subjectKey = deriveThreadKey({
    subject: input.subject,
    counterpart: input.counterpart,
  });

  const { data, error } = await db.rpc("email_thread_upsert", {
    _mailbox_id: input.mailboxId,
    _participants: Array.from(new Set(input.participants.filter((v) => !!v))),
    _subject: normalizeSubject(input.subject),
    _subject_key: subjectKey,
  });

  if (error || !data) {
    console.error("[mail:threading] upsert failed", safeLogFields({ code: error?.code ?? null }));
    return null;
  }
  return data as unknown as string;
}
