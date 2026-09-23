/**
 * Tipuri PrimulAnunț.ro — API public v1, scrise exclusiv după documentația
 * oficială: https://www.primulanunt.ro/api-agentii
 *
 * Doar operațiile de listare (ping, creare/actualizare, modificare parțială,
 * arhivare). Pozele (multipart) și promovarea cu credite nu sunt acoperite aici.
 */

/** Tranzacția, exact cum o numește documentația. */
export type PrimulAnuntPurpose = "sale" | "rent";

/** Precizia coordonatelor acceptată de portal. */
export type PrimulAnuntLocationPrecision = "exact" | "approximate";

/**
 * Corpul cererii `POST /api/public/v1/listings`.
 * `external_id` face trimiterea idempotentă: a doua trimitere actualizează
 * același anunț în loc să creeze unul nou.
 */
export type PrimulAnuntListingDto = {
  external_id: string;
  title: string;
  description: string;
  purpose: PrimulAnuntPurpose;
  property_type: string;
  price: number;
  currency: string;
  rooms?: number;
  bathrooms?: number;
  surface_m2?: number;
  county: string;
  city: string;
  area?: string;
  features?: string[];
  /** Agentul responsabil, afișat la anunț. */
  agent_name?: string;
  agent_phone?: string;
  agent_email?: string;
  lat?: number;
  lng?: number;
  location_precision?: PrimulAnuntLocationPrecision;
  postal_code?: string;
  floor?: number;
  floors_total?: number;
  video_url?: string;
  /** Anunț nelistat public; pentru anunțurile de agenție se trimite `false`. */
  is_private?: boolean;
};

/** `PATCH /api/public/v1/listings/{id}` modifică doar câmpurile trimise. */
export type PrimulAnuntListingPatch = Partial<PrimulAnuntListingDto> & {
  status?: string;
};

/** Anunțul întors de portal (răspunsul conține linkul public complet). */
export type PrimulAnuntListing = {
  id?: string;
  external_id?: string;
  slug?: string | null;
  status?: string | null;
  url?: string | null;
  rejection_reason?: string | null;
};

/** Răspunsul la `GET /api/public/v1/ping`. */
export type PrimulAnuntPing = {
  ok?: boolean;
  status?: string;
};

/**
 * O poză pregătită pentru `POST /api/public/v1/listings/{id}/media`
 * (`multipart/form-data`, câmpul `file`). Portalul acceptă maximum 20 de
 * imagini, fiecare sub 10 MB; prima devine automat coperta.
 */
export type PrimulAnuntMediaFile = {
  /** Identificatorul imaginii din CRM, doar pentru jurnal. */
  imageId: string;
  filename: string;
  contentType: string;
  bytes: Uint8Array;
};

/** O fotografie, așa cum o întoarce portalul după încărcare sau la listare. */
export type PrimulAnuntMediaItem = {
  id?: string;
  url?: string | null;
  position?: number | null;
};

/** Răspunsul la încărcarea pozelor. */
export type PrimulAnuntMediaUpload = {
  uploaded: number;
  media: PrimulAnuntMediaItem[];
};



/** Clasificarea erorilor documentate de portal. */
export type PrimulAnuntFailKind =
  | "invalid_api_key"
  | "not_found"
  | "invalid_data"
  | "processing_error"
  | "server_error"
  | "timeout"
  | "network_error"
  | "blocked_host";

export type PrimulAnuntCallFail = {
  ok: false;
  kind: PrimulAnuntFailKind;
  status: number | null;
  message: string;
  /** Corpul brut al răspunsului, pentru jurnalizare. */
  body: unknown;
  /** Câmpurile invalide raportate de portal la 422. */
  fields?: string[];
};

export type PrimulAnuntCallOk<T> = { ok: true; status: number; data: T };

export type PrimulAnuntCall<T> = PrimulAnuntCallOk<T> | PrimulAnuntCallFail;
