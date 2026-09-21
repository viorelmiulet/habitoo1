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

/**
 * Payload-ul acceptat de `POST /api/Article` (upsert după `externalid`).
 * Adaptorul primește DTO-ul deja construit și completează doar `user.email`.
 */
export type SaveArticleDto = {
  user: RomimoUser;
  /** Identificatorul nostru stabil al anunțului, cheia de upsert la Romimo. */
  externalid: string;
} & Record<string, unknown>;

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
