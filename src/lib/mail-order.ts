/**
 * Superadmin → Email: ordinea mesajelor într-o conversație.
 *
 * Serverul întoarce mesajele crescător (cele mai vechi primele). În ecran le
 * afișăm descrescător: cel mai nou mesaj este primul, lângă caseta de răspuns.
 * Sortarea lucrează întotdeauna pe o copie, ca să nu modifice datele din cache.
 */

/** Doar câmpurile de care are nevoie sortarea; `MailMessage` le conține pe toate. */
export type DatedMessage = {
  id: string;
  received_at?: string | null;
  sent_at?: string | null;
  created_at?: string | null;
};

function fieldTime(value: string | null | undefined): number {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

/** Data afișată în cardul mesajului: `received_at ?? sent_at ?? created_at`. */
export function messageDisplayDate(message: DatedMessage): number {
  return fieldTime(message.received_at ?? message.sent_at ?? message.created_at);
}

/**
 * Copie sortată descrescător după data afișată; la date egale, cel mai nou
 * `created_at` primul. Intrarea inițială rămâne neatinsă.
 */
export function sortMessagesNewestFirst<T extends DatedMessage>(
  messages: readonly T[],
): T[] {
  return [...messages].sort((a, b) => {
    const byDisplay = messageDisplayDate(b) - messageDisplayDate(a);
    if (byDisplay !== 0) return byDisplay;
    return fieldTime(b.created_at) - fieldTime(a.created_at);
  });
}
