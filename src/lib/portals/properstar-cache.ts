/**
 * Invalidarea feedului Properstar din interfață.
 *
 * Orice modificare care schimbă conținutul feedului (ofertă, fotografii,
 * selecția pentru portal, datele agenției sau ale agentului) golește cache-ul
 * agenției. Apelul nu blochează salvarea: dacă eșuează, feedul se reconstruiește
 * oricum la expirare.
 */
import { properstarFeedChanged } from "./properstar.functions";

export function notifyProperstarFeedChanged(): void {
  void properstarFeedChanged().catch(() => {
    // Intenționat ignorat: golirea cache-ului nu poate strica o salvare reușită.
  });
}
