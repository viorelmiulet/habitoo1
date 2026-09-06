/**
 * Adaptor ClickImob — DOAR PREGĂTIRE.
 *
 * Ce este validat public: ClickImob primește notificări de la CRM-uri și preia
 * apoi oferta din feedul CRM-ului. Endpointul documentat pentru CRM este
 * orientat momentan către provider-ul `immoflux`:
 *   POST https://www.clickimob.ro/api/public/crm-webhook
 *        ?agency=<agency_uuid>&token=<webhook_token>&provider=immoflux
 *        body: {"id": <property_id>}
 *
 * Nu inventăm alte endpointuri și nu trimitem cereri reale către ClickImob până
 * la acceptarea Habitoo ca provider și primirea de credențiale reale:
 * `buildWebhookRequest` construiește cererea, `notifyPropertyChanged` o execută
 * numai dacă integrarea este activă ȘI `allowLiveRequests` este explicit true.
 */

export const CLICKIMOB_PORTAL_KEY = "clickimob";
export const CLICKIMOB_WEBHOOK_URL = "https://www.clickimob.ro/api/public/crm-webhook";
/** Providerul acceptat astăzi de endpointul public ClickImob. */
export const CLICKIMOB_PROVIDER = "immoflux";

export type ClickImobConfig = {
  /** UUID-ul agenției în ClickImob (primit de la ClickImob). */
  agencyId: string;
  /** Tokenul de webhook primit de la ClickImob. Nu se afișează în UI. */
  webhookToken: string;
  endpointUrl?: string;
  provider?: string;
};

export type PreparedWebhookRequest = {
  method: "POST";
  /** URL fără token (pentru loguri/diagnostic). */
  safeUrl: string;
  headers: Record<string, string>;
  body: string;
};

export function isClickImobConfigComplete(config: Partial<ClickImobConfig> | null): boolean {
  return Boolean(config?.agencyId && config?.webhookToken);
}

/** Construiește cererea de notificare; nu execută nimic. */
export function buildWebhookRequest(
  config: ClickImobConfig,
  propertyId: string,
): { url: string; prepared: PreparedWebhookRequest } {
  const base = config.endpointUrl?.trim() || CLICKIMOB_WEBHOOK_URL;
  const url = new URL(base);
  url.searchParams.set("agency", config.agencyId);
  url.searchParams.set("token", config.webhookToken);
  url.searchParams.set("provider", config.provider ?? CLICKIMOB_PROVIDER);

  const safe = new URL(url.toString());
  safe.searchParams.set("token", "***");

  return {
    url: url.toString(),
    prepared: {
      method: "POST",
      safeUrl: safe.toString(),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: propertyId }),
    },
  };
}

export type NotifyResult =
  | { sent: false; reason: "not_configured" | "disabled" | "dry_run"; safeUrl: string | null }
  | { sent: true; status: number; safeUrl: string };

/**
 * Notifică ClickImob despre modificarea unei oferte.
 * Implicit rulează în dry-run: nu se face niciun request extern.
 */
export async function notifyPropertyChanged(input: {
  config: Partial<ClickImobConfig> | null;
  propertyId: string;
  enabled: boolean;
  allowLiveRequests?: boolean;
}): Promise<NotifyResult> {
  if (!isClickImobConfigComplete(input.config)) {
    return { sent: false, reason: "not_configured", safeUrl: null };
  }
  const { url, prepared } = buildWebhookRequest(input.config as ClickImobConfig, input.propertyId);
  if (!input.enabled) return { sent: false, reason: "disabled", safeUrl: prepared.safeUrl };
  if (!input.allowLiveRequests) return { sent: false, reason: "dry_run", safeUrl: prepared.safeUrl };

  const response = await fetch(url, {
    method: prepared.method,
    headers: prepared.headers,
    body: prepared.body,
  });
  return { sent: true, status: response.status, safeUrl: prepared.safeUrl };
}
