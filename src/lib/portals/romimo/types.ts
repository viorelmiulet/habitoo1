/**
 * Tipuri Romimo API v2, conform documentației oficiale (Swagger services.romimo.ro).
 *
 * Scrise de la zero pentru acest portal: nu reutilizează convenții sau
 * structuri de la alte integrări. Câmpurile pe care documentația nu le
 * garantează nu sunt inventate — DTO-ul anunțului rămâne deschis, fiind
 * construit în afara adaptorului (pasul de mapare).
 */

/** Contul agenției pe Romimo: emailul este identitatea folosită de API. */
export type RomimoUser = {
  email: string;
};

/** Blocul de contact al anunțului (agentul/agentia responsabilă). */
export type RomimoContact = {
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
} & Record<string, unknown>;

/** Localizarea anunțului, cu nume de județ/oraș/zonă și coordonate opționale. */
export type RomimoLocation = {
  countyName?: string | null;
  cityName?: string | null;
  areaName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
} & Record<string, unknown>;

/** O caracteristică a proprietății, sub formă de pereche cheie/valoare. */
export type RomimoProperty = {
  key: string;
  value: unknown;
};

/** O poză a anunțului: URL public accesibil portalului + ordinea de afișare. */
export type RomimoPicture = {
  url: string;
  rank?: number | null;
} & Record<string, unknown>;

/** Anunțul propriu-zis: `externalid` este cheia de upsert la Romimo. */
export type RomimoAd = {
  active?: boolean | null;
  promoted?: boolean | null;
  /** Identificatorul nostru stabil al anunțului, cheia de upsert la Romimo. */
  externalid: string;
  category?: string | null;
  price?: number | null;
  currency?: string | null;
  title?: string | null;
  text?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
} & Record<string, unknown>;

/**
 * Payload-ul acceptat de `POST /api/Article` (upsert după `ad.externalid`).
 * Adaptorul primește DTO-ul deja construit și completează doar `user.email`.
 */
export type SaveArticleDto = {
  user: RomimoUser;
  ad: RomimoAd;
  contact?: RomimoContact | null;
  location?: RomimoLocation | null;
  properties?: RomimoProperty[];
  pictures?: RomimoPicture[];
};

/** `GET /api/User/Package` — pachetul contului Romimo. */
export type RomimoPackage = {
  name?: string | null;
  active?: boolean | null;
  expiredate?: string | null;
} & Record<string, unknown>;

/** `GET /api/Article` — anunțul așa cum îl raportează Romimo. */
export type RomimoArticle = {
  externalid?: string | null;
  url?: string | null;
  status?: string | null;
} & Record<string, unknown>;

/** Corpul standard de eroare (RFC 7807) returnat de Romimo la 400. */
export type RomimoProblemDetails = {
  type?: string | null;
  title?: string | null;
  status?: number | null;
  detail?: string | null;
  errors?: Record<string, unknown> | null;
};

/** Rezultatul unui apel Romimo: succes cu date, sau eșec descris. */
export type RomimoCallOk<T> = { ok: true; status: number; data: T };
export type RomimoCallFail = {
  ok: false;
  /** Statusul HTTP real, sau `null` la timeout/eroare de rețea. */
  status: number | null;
  kind:
    | "invalid_request"
    | "invalid_api_key"
    | "token_expired"
    | "unsupported_media_type"
    | "not_found"
    | "server_error"
    | "timeout"
    | "network_error"
    | "blocked_host";
  /** Mesajul în română, afișabil utilizatorului. */
  message: string;
  /** Corpul răspunsului, pentru jurnalizare (sanitizat de apelant). */
  body: unknown;
};
export type RomimoCall<T> = RomimoCallOk<T> | RomimoCallFail;
