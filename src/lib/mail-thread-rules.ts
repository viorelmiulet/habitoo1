/**
 * Pure mirror of the conversation rules enforced in the database
 * (`email_thread_resolve()` and the `email_messages_touch_thread` trigger).
 * Kept side-effect free so the rules are unit-testable.
 */
export const THREAD_STATUSES = ["open", "archived", "spam", "trash"] as const;
export type ThreadStatus = (typeof THREAD_STATUSES)[number];

export const SUBJECT_FALLBACK_MAX_AGE_DAYS = 30;

export type ThreadCandidate = {
  id: string;
  participants: string[];
  lastMessageAt: string | Date;
};

/**
 * Decides which conversation a message joins.
 * 1. Header link (`In-Reply-To`/`References`) always wins.
 * 2. Subject fallback only when the counterpart is already a participant and
 *    the conversation had activity within the last 30 days.
 * 3. Otherwise → null (a new conversation is created).
 */
export function pickThread(input: {
  headerThreadId: string | null;
  candidates: ThreadCandidate[];
  counterpart: string | null;
  now?: Date;
}): string | null {
  if (input.headerThreadId) return input.headerThreadId;
  const who = (input.counterpart ?? "").trim().toLowerCase();
  if (!who) return null;
  const now = (input.now ?? new Date()).getTime();
  const maxAge = SUBJECT_FALLBACK_MAX_AGE_DAYS * 86_400_000;
  const eligible = input.candidates
    .filter((c) => c.participants.some((p) => p.trim().toLowerCase() === who))
    .filter((c) => now - new Date(c.lastMessageAt).getTime() < maxAge)
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  return eligible[0]?.id ?? null;
}

/** Only an inbound message reopens an archived conversation. */
export function statusAfterMessage(
  status: ThreadStatus,
  direction: "inbound" | "outbound",
): ThreadStatus {
  return direction === "inbound" && status === "archived" ? "open" : status;
}
