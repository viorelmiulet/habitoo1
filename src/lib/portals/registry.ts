/**
 * Registry generic de portaluri imobiliare.
 *
 * Fiecare portal își declară EXPLICIT modelul de integrare: cine emite
 * credențialul, în ce direcție circulă datele și ce operații suportă.
 * Nimic nu este presupus: un portal fără adaptor implementat rămâne
 * `coming_soon`, fără metode de autentificare declarate.
 *
 * Pentru un portal nou este suficient: definiție aici + adaptor + mapper.
 * Nu se modifică baza de date, UI-ul sau managementul de secrete.
 */

export type PortalId = string;

/** Disponibilitatea integrării în Habitoo (nu starea conexiunii agenției). */
export type PortalAvailability = "available" | "coming_soon" | "disabled";

/** Direcția fluxului de date. */
export type PortalDirection = "habitoo_to_portal" | "portal_to_habitoo" | "bidirectional";

/** Modele de autentificare posibile. Portalul declară doar ce suportă real. */
export type PortalAuthenticationMode =
  | "portal_api_key"
  | "habitoo_api_key"
  | "oauth"
  | "basic_auth"
  | "username_password"
  | "query_parameter"
  | "none";

/** Operații pe care le poate expune un portal. */
export type PortalCapability =
  | "test_connection"
  | "publish_listing"
  | "update_listing"
  | "withdraw_listing"
  | "sync"
  | "feed_pull"
  | "webhook_send"
  | "webhook_receive"
  | "fetch_listings"
  | "fetch_agents"
  | "publish_bulk";

export type PortalConfigField = {
  key: string;
  label: string;
  help?: string;
  placeholder?: string;
  /** Valoare secretă: se trimite doar server-side, nu se afișează niciodată. */
  secret?: boolean;
  optional?: boolean;
  /** Unde se persistă: identificatorul contului, credențialul criptat sau setările. */
  target: "external_account_id" | "credentials" | "settings";
};

export type PortalDefinition = {
  id: PortalId;
  display_name: string;
  description: string;
  /** Token text scurt folosit ca logo în UI (fără asset extern). */
  logo: string;
  status: PortalAvailability;
  directions: PortalDirection[];
  authentication: PortalAuthenticationMode[];
  capabilities: PortalCapability[];
  configuration_schema: { fields: PortalConfigField[] };
  website?: string;
  docs?: string;
  /** Limitări reale, afișate în UI ca să nu promitem funcții inexistente. */
  notes?: string;
};

export const PORTAL_DIRECTION_LABEL: Record<PortalDirection, string> = {
  habitoo_to_portal: "Habitoo → portal",
  portal_to_habitoo: "Portal → Habitoo",
  bidirectional: "Habitoo ↔ portal",
};

export const PORTAL_AUTH_LABEL: Record<PortalAuthenticationMode, string> = {
  portal_api_key: "Cheie API emisă de portal",
  habitoo_api_key: "Cheie API emisă de Habitoo",
  oauth: "OAuth",
  basic_auth: "Autentificare Basic",
  username_password: "Utilizator și parolă",
  query_parameter: "Cheie în parametru de URL",
  none: "Fără autentificare",
};

export const PORTAL_CAPABILITY_LABEL: Record<PortalCapability, string> = {
  test_connection: "Test conexiune",
  publish_listing: "Publicare anunț",
  update_listing: "Actualizare anunț",
  withdraw_listing: "Retragere anunț",
  sync: "Sincronizare",
  feed_pull: "Portalul citește feedul Habitoo",
  webhook_send: "Notificare către portal",
  webhook_receive: "Notificare de la portal",
  fetch_listings: "Import anunțuri",
  fetch_agents: "Import agenți",
  publish_bulk: "Publicare în masă",
};

export const PORTAL_AVAILABILITY_LABEL: Record<PortalAvailability, string> = {
  available: "Disponibil",
  coming_soon: "În curând",
  disabled: "Indisponibil",
};

export const PORTALS: PortalDefinition[] = [
  {
    id: "clickimob",
    display_name: "ClickImob",
    description:
      "ClickImob importă ofertele din feedul Habitoo și primește notificări la fiecare modificare a unei proprietăți.",
    logo: "CI",
    status: "available",
    // Bidirecțional prin construcție: Habitoo notifică portalul (webhook) și
    // portalul citește feedul Habitoo cu o cheie emisă de noi.
    directions: ["habitoo_to_portal", "portal_to_habitoo"],
    authentication: ["portal_api_key", "habitoo_api_key"],
    capabilities: [
      "test_connection",
      "publish_listing",
      "update_listing",
      "withdraw_listing",
      "sync",
      "webhook_send",
      "feed_pull",
    ],
    configuration_schema: {
      fields: [
        {
          key: "external_account_id",
          label: "Identificator agenție la ClickImob",
          help: "UUID-ul agenției, primit de la ClickImob.",
          target: "external_account_id",
        },
        {
          key: "webhook_token",
          label: "Token webhook ClickImob",
          help: "Token primit de la ClickImob pentru notificări.",
          secret: true,
          target: "credentials",
        },
        {
          key: "endpoint_url",
          label: "Adresa webhook (opțional)",
          placeholder: "https://www.clickimob.ro/api/public/crm-webhook",
          optional: true,
          target: "settings",
        },
      ],
    },
    website: "https://www.clickimob.ro",
    docs: "https://www.clickimob.ro",
    notes:
      "ClickImob nu expune un API general de creare/editare anunțuri. Publicarea se face prin notificare + citirea feedului Habitoo. Importul de anunțuri sau agenți din ClickImob nu este suportat.",
  },
  {
    id: "imove",
    display_name: "iMove.ro",
    description:
      "iMove citește periodic feedul JSON Habitoo și importă automat ofertele selectate. Retragerea se face prin dispariția ofertei din feed.",
    logo: "iM",
    status: "available",
    // Un singur sens: Habitoo expune feedul, iMove îl consumă.
    directions: ["habitoo_to_portal"],
    // Cheia API este emisă de iMove pentru contul agenției; Habitoo doar o
    // stochează și o acceptă la citirea feedului (inclusiv în URL).
    authentication: ["portal_api_key", "query_parameter"],
    capabilities: ["test_connection", "feed_pull"],
    configuration_schema: {
      fields: [
        {
          key: "api_key",
          label: "Cheie API iMove",
          help: "Cheia primită din contul tău iMove.ro. Se salvează criptat și este folosită de iMove pentru a citi feedul.",
          secret: true,
          target: "credentials",
        },
      ],
    },
    website: "https://imove.ro",
    docs: "https://imove.ro/docs/feeds",
    notes:
      "iMove nu documentează un API de creare/editare/ștergere anunț pentru CRM-uri. Publicarea se face exclusiv prin feedul Habitoo: selectezi oferta, iMove o importă la următoarea sincronizare; dacă o deselectezi, dispare din feed și iMove o arhivează. Cheia API o emite iMove, nu Habitoo.",

  },
  // Portalurile de mai jos NU au încă integrare implementată. Nu declarăm
  // metode de autentificare sau capabilități pe care nu le-am verificat.

  {
    id: "imospot",
    display_name: "Imospot.ro",
    description:
      "Imospot expune un API REST clasic: Habitoo trimite direct anunțul (creare, actualizare, retragere) cu cheia API a agenției.",
    logo: "IS",
    status: "available",
    directions: ["habitoo_to_portal"],
    // Cheia este EMISĂ DE IMOSPOT pentru contul agenției; Habitoo doar o salvează.
    authentication: ["portal_api_key"],
    capabilities: ["test_connection", "publish_listing", "update_listing", "withdraw_listing", "sync"],
    configuration_schema: {
      fields: [
        {
          key: "api_key",
          label: "Cheie API Imospot",
          help: "Cheia primită din contul tău Imospot.ro (ex. sk_agentie_…). Se salvează criptat și se trimite ca Bearer token.",
          placeholder: "sk_agentie_…",
          secret: true,
          target: "credentials",
        },
      ],
    },
    website: "https://www.imospot.ro",
    docs: "https://www.imospot.ro/api/v1",
    notes:
      "Publicarea este PUSH direct, idempotentă după external_id (derivat din identificatorul intern al ofertei). Retragerea arhivează anunțul la Imospot, nu îl șterge definitiv, iar o nouă publicare îl readuce live. Cerințe obligatorii verificate înainte de trimitere: titlu de minimum 8 caractere, descriere de minimum 60 caractere, preț întreg pozitiv, telefon de contact, județ și localitate, minimum o imagine publicabilă. O proprietate cu ambele tranzacții active generează două anunțuri separate (vânzare și închiriere). Promovările plătite nu sunt trimise din Habitoo.",
  },
  {
    id: "homepitch",
    display_name: "HomePitch.ro",
    description:
      "HomePitch citește feedul dedicat Habitoo cu o cheie emisă de noi și, opțional, primește o notificare de import instant la bifarea unei oferte.",
    logo: "HP",
    status: "available",
    directions: ["habitoo_to_portal"],
    // Cheia este EMISĂ DE HABITOO (ca la ClickImob) și se introduce în HomePitch.
    authentication: ["habitoo_api_key"],
    capabilities: ["test_connection", "feed_pull", "publish_listing", "update_listing", "sync"],
    configuration_schema: {
      fields: [
        {
          key: "habitoo_api_key",
          label: "Cheia Habitoo folosită pentru import instant (opțional)",
          help: "Copiază aici cheia API emisă mai jos pentru HomePitch. Este necesară doar pentru importul instant la bifarea unei oferte; citirea feedului funcționează fără ea.",
          secret: true,
          optional: true,
          target: "credentials",
        },
      ],
    },
    website: "https://homepitch.ro",
    docs: "https://homepitch.ro/setari-crm",
    notes:
      "Model PULL: HomePitch citește endpointurile Habitoo /api/public/homepitch/v1/* cu cheia emisă de noi (agency-wide, acoperă toți agenții agenției). Agentul o introduce în HomePitch la /setari-crm. O ofertă intră în feed doar dacă are coordonate (lat/lng), agent asignat cu email valid, titlu, descriere, preț în EUR și tip de proprietate mapabil — ofertele în altă monedă nu sunt trimise. O proprietate cu ambele tranzacții active se expune o singură dată, ca vânzare, cu mențiunea închirierii în descriere. Retragerea se face prin dispariția din feed. Importul instant (push) necesită cheia publică HomePitch salvată ca HOMEPITCH_PUBLIC_ANON_KEY.",
  },
  {
    id: "imobiliare_ro",

    display_name: "Imobiliare.ro",
    description: "Integrare de publicare anunțuri. Necesită acord și documentație de la portal.",
    logo: "IR",
    status: "coming_soon",
    directions: [],
    authentication: [],
    capabilities: [],
    configuration_schema: { fields: [] },
    website: "https://www.imobiliare.ro",
  },
  {
    id: "storia",
    display_name: "Storia",
    description: "Integrare de publicare anunțuri. Necesită acord și documentație de la portal.",
    logo: "ST",
    status: "coming_soon",
    directions: [],
    authentication: [],
    capabilities: [],
    configuration_schema: { fields: [] },
    website: "https://www.storia.ro",
  },
  {
    id: "olx",
    display_name: "OLX",
    description: "Integrare de publicare anunțuri. Necesită acord și documentație de la portal.",
    logo: "OX",
    status: "coming_soon",
    directions: [],
    authentication: [],
    capabilities: [],
    configuration_schema: { fields: [] },
    website: "https://www.olx.ro",
  },
  {
    id: "publi24",
    display_name: "Publi24",
    description: "Integrare de publicare anunțuri. Necesită acord și documentație de la portal.",
    logo: "P24",
    status: "coming_soon",
    directions: [],
    authentication: [],
    capabilities: [],
    configuration_schema: { fields: [] },
    website: "https://www.publi24.ro",
  },
];

export function getPortalDefinition(id: string): PortalDefinition | null {
  return PORTALS.find((p) => p.id === id) ?? null;
}

export function portalSupports(definition: PortalDefinition, capability: PortalCapability): boolean {
  return definition.capabilities.includes(capability);
}

/** Starea conexiunii unei agenții (diferită de disponibilitatea integrării). */
export type PortalConnectionStatus =
  | "not_configured"
  | "ready"
  | "connected"
  | "error"
  | "disconnected";

export const PORTAL_CONNECTION_LABEL: Record<
  PortalConnectionStatus,
  { label: string; tone: "success" | "warning" | "danger" | "neutral" }
> = {
  not_configured: { label: "Neconectat", tone: "neutral" },
  ready: { label: "Pregătit pentru conectare", tone: "warning" },
  connected: { label: "Conectat", tone: "success" },
  error: { label: "Eroare", tone: "danger" },
  disconnected: { label: "Deconectat", tone: "neutral" },
};

/**
 * Starea derivată din configurarea existentă. Nu marcăm niciodată „connected”
 * doar pentru că datele există: conectarea rămâne confirmată de un test reușit.
 */
export function derivePortalConnectionStatus(input: {
  definition: PortalDefinition;
  externalAccountId: string | null;
  hasPortalCredential: boolean;
  hasHabitooKey: boolean;
  lastError: string | null;
  testedOk: boolean;
}): PortalConnectionStatus {
  const required = input.definition.configuration_schema.fields.filter((f) => !f.optional);
  const complete = required.every((field) => {
    if (field.target === "external_account_id") return Boolean(input.externalAccountId);
    if (field.target === "credentials") return input.hasPortalCredential;
    return true;
  });
  if (!complete) return "not_configured";
  // Portalurile fără credențiale proprii (doar feed cu cheie Habitoo) nu pot
  // funcționa fără o cheie activă emisă de noi.
  if (
    required.length === 0 &&
    input.definition.authentication.includes("habitoo_api_key") &&
    !input.hasHabitooKey
  ) {
    return "not_configured";
  }
  if (input.lastError) return "error";

  return input.testedOk ? "connected" : "ready";
}
