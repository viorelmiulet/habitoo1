/**
 * Rezolvarea codului poștal pe server.
 *
 * Refolosește EXACT serviciul deja integrat pentru adrese și coordonate:
 * Nominatim (OpenStreetMap), la fel ca `geocodeAddress` — același User-Agent,
 * aceeași limitare de o cerere pe secundă, fără cheie și fără al doilea
 * furnizor. Codul de nivel localitate vine din nomenclatorul propriu
 * (`ro_localities` / `ro_uats`), deci nu costă niciun apel extern.
 *
 * Toate accesele la date trec prin „porturi”, ca logica să fie testabilă fără
 * rețea și fără bază de date.
 */
import {
  coordCacheKey,
  decidePostalResolution,
  pickPostalCode,
  resolutionKey,
  type PostalCodeRow,
  type PostalCodeSource,
} from "./postal-code";

const NOMINATIM_UA = "Habitoo CRM (contact@habitoo.ro)";
const MIN_INTERVAL_MS = 1100;
/** Plafon zilnic de apeluri către furnizor, per agenție. */
export const MAX_PROVIDER_CALLS_PER_ORG_PER_DAY = 200;

let lastCallAt = 0;

export type ReverseLookup = { street: string | null; locality: string | null };

export type PostalPorts = {
  /** Interogarea furnizorului pentru o pereche de coordonate. */
  reverse: (lat: number, lng: number) => Promise<ReverseLookup>;
  /** Codul poștal principal al localității din nomenclatorul propriu. */
  localityPostal: (row: PostalCodeRow) => Promise<string | null>;
  cacheGet: (key: string) => Promise<{ postalCode: string | null; source: string } | null>;
  cacheSet: (key: string, postalCode: string | null, source: string) => Promise<void>;
  /** Câte apeluri către furnizor a făcut agenția în ultimele 24 de ore. */
  providerCallsToday: () => Promise<number>;
  logAttempt: (entry: {
    outcome: string;
    postalCode: string | null;
    source: string | null;
    usedProvider: boolean;
    detail: string | null;
  }) => Promise<void>;
  save: (value: {
    postalCode: string;
    source: PostalCodeSource;
    resolvedFrom: string;
  }) => Promise<void>;
};

export type PostalResolution = {
  propertyId: string;
  status: "resolved" | "skipped" | "not_found" | "capped" | "failed";
  postalCode: string | null;
  source: PostalCodeSource | null;
  reason: string;
  usedProvider: boolean;
};

/** Traducerea motivelor în română simplă, pentru raportul din interfață. */
export const POSTAL_REASON_LABELS: Record<string, string> = {
  manual: "Cod introdus manual — nu se atinge",
  unchanged: "Adresa nu s-a schimbat de la ultima rezolvare",
  no_location: "Fără adresă și fără coordonate",
  missing: "Lipsea codul poștal",
  location_changed: "Adresa sau poziția s-au schimbat",
  provider_cap: "Plafonul zilnic de căutări a fost atins",
  no_result: "Nici furnizorul, nici nomenclatorul nu au un cod",
  failed: "Căutarea codului poștal a eșuat",
};

/** Reverse geocoding real (Nominatim), cu limitarea de rată din politica lor. */
export async function nominatimReverse(lat: number, lng: number): Promise<ReverseLookup> {
  const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();

  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("zoom", "18");

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": NOMINATIM_UA, Accept: "application/json" },
    });
    if (!res.ok) return { street: null, locality: null };
    const body = (await res.json()) as { address?: Record<string, string> };
    const address = body.address ?? {};
    // Nominatim întoarce codul poștal al celui mai apropiat obiect adresabil;
    // îl considerăm „de stradă” doar când răspunsul conține și strada.
    const postcode = address["postcode"] ?? null;
    const hasStreet = Boolean(address["road"] ?? address["pedestrian"] ?? address["residential"]);
    return { street: hasStreet ? postcode : null, locality: hasStreet ? null : postcode };
  } catch {
    return { street: null, locality: null };
  }
}

/**
 * Rezolvă codul poștal pentru o ofertă. Nu suprascrie niciodată o valoare
 * manuală și nu scrie nimic dacă nu găsește un cod valid.
 */
export async function resolvePostalCodeFor(
  propertyId: string,
  row: PostalCodeRow,
  ports: PostalPorts,
): Promise<PostalResolution> {
  const decision = decidePostalResolution(row);
  if (!decision.resolve) {
    // Consemnăm și rulările fără efect: altfel jurnalul pare gol și nu se vede
    // niciodată că rezolvarea a fost cerută.
    await ports.logAttempt({
      outcome: "skipped",
      postalCode: (row.postal_code ?? "").trim() || null,
      source: (row.postal_code_source as PostalCodeSource | null) ?? null,
      usedProvider: false,
      detail: POSTAL_REASON_LABELS[decision.reason] ?? decision.reason,
    });
    return {
      propertyId,
      status: "skipped",
      postalCode: (row.postal_code ?? "").trim() || null,
      source: (row.postal_code_source as PostalCodeSource | null) ?? null,
      reason: decision.reason,
      usedProvider: false,
    };
  }

  const hasCoords = typeof row.lat === "number" && typeof row.lng === "number";
  let street: string | null = null;
  let usedProvider = false;
  let capped = false;

  if (hasCoords) {
    const key = coordCacheKey(row.lat as number, row.lng as number);
    const cached = await ports.cacheGet(key);
    if (cached) {
      street = cached.source === "geocoded" ? cached.postalCode : null;
    } else if ((await ports.providerCallsToday()) >= MAX_PROVIDER_CALLS_PER_ORG_PER_DAY) {
      capped = true;
    } else {
      usedProvider = true;
      const lookup = await ports.reverse(row.lat as number, row.lng as number);
      const picked = pickPostalCode(lookup);
      street = picked.source === "geocoded" ? picked.postalCode : null;
      await ports.cacheSet(key, picked.postalCode, picked.source ?? "none");
    }
  }

  const locality = street ? null : await ports.localityPostal(row);
  const picked = pickPostalCode({ street, locality });

  if (!picked.postalCode) {
    const outcome = capped ? "capped" : "not_found";
    await ports.logAttempt({
      outcome,
      postalCode: null,
      source: null,
      usedProvider,
      detail: capped ? POSTAL_REASON_LABELS["provider_cap"]! : POSTAL_REASON_LABELS["no_result"]!,
    });
    return {
      propertyId,
      status: capped ? "capped" : "not_found",
      postalCode: null,
      source: null,
      reason: capped ? "provider_cap" : "no_result",
      usedProvider,
    };
  }

  await ports.save({
    postalCode: picked.postalCode,
    source: picked.source,
    resolvedFrom: resolutionKey(row),
  });
  await ports.logAttempt({
    outcome: "resolved",
    postalCode: picked.postalCode,
    source: picked.source,
    usedProvider,
    detail: null,
  });

  return {
    propertyId,
    status: "resolved",
    postalCode: picked.postalCode,
    source: picked.source,
    reason: decision.reason,
    usedProvider,
  };
}
