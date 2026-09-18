/**
 * Starea contului Imobiliare.ro (`GET /api/v3/me`), pur: nicio rețea.
 *
 * De ce există: un anunț poate fi `online` în cont și totuși invizibil public,
 * dacă agenția nu are abonament activ. Portalul nu semnalează asta pe anunț,
 * doar pe cont — deci o citim de acolo și o spunem explicit utilizatorului, în
 * loc să afișăm un link care duce în prima pagină a portalului.
 */

export type ImobiliareAccountState = {
  isSubscriptionActive: boolean | null;
  subscriptionStatus: string | null;
  subscriptionType: string | null;
  listingOnlineCount: number | null;
};

/** Mesajul unic afișat oriunde abonamentul lipsește. */
export const IMOBILIARE_NO_SUBSCRIPTION_MESSAGE =
  "Contul Imobiliare.ro nu are abonament activ: anunțurile rămân „online” în cont, dar nu sunt publice pe site.";

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function count(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Răspunsul are forma `{ data: { agency: { ... } } }`. Câmpurile absente rămân
 * `null`: nu presupunem „activ” și nu presupunem „inactiv”.
 */
export function parseImobiliareAccount(body: unknown): ImobiliareAccountState {
  const empty: ImobiliareAccountState = {
    isSubscriptionActive: null,
    subscriptionStatus: null,
    subscriptionType: null,
    listingOnlineCount: null,
  };
  if (!body || typeof body !== "object") return empty;
  const data = (body as Record<string, unknown>)["data"];
  if (!data || typeof data !== "object") return empty;
  const agency = (data as Record<string, unknown>)["agency"];
  const row = (
    agency && typeof agency === "object" ? agency : data
  ) as Record<string, unknown>;
  const active = row["is_subscription_active"];
  return {
    isSubscriptionActive: typeof active === "boolean" ? active : null,
    subscriptionStatus: text(row["subscription_status"]),
    subscriptionType: text(row["subscription_type"]),
    listingOnlineCount: count(row["listing_online_count"]),
  };
}

/** Abonamentul lipsește cu certitudine (nu „nu știm”). */
export function subscriptionInactive(state: ImobiliareAccountState | null): boolean {
  return state?.isSubscriptionActive === false;
}

/** Propoziția pentru testul de conexiune și pentru panoul Superadmin. */
export function describeImobiliareAccount(state: ImobiliareAccountState | null): string {
  if (!state || state.isSubscriptionActive === null) {
    return "Starea abonamentului Imobiliare.ro nu a putut fi citită.";
  }
  const parts: string[] = [];
  if (state.subscriptionType) parts.push(`tip „${state.subscriptionType}”`);
  if (state.subscriptionStatus) parts.push(`status „${state.subscriptionStatus}”`);
  if (state.listingOnlineCount !== null) {
    parts.push(`${state.listingOnlineCount} anunțuri online în cont`);
  }
  const suffix = parts.length ? ` (${parts.join(", ")}).` : ".";
  return state.isSubscriptionActive
    ? `Abonament Imobiliare.ro activ${suffix}`
    : `${IMOBILIARE_NO_SUBSCRIPTION_MESSAGE}${parts.length ? ` Detalii: ${parts.join(", ")}.` : ""}`;
}
