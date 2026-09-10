/**
 * Constante Storia.ro / OLX Group RE API.
 *
 * Valorile de site și locale sunt cele documentate de OLX Group în tabelul
 * „supported sites” (developer.olxgroup.com → authorization-flow):
 *   Portugalia → www.imovirtual.com · urn:site:imovirtualcom · pt
 *   Polonia    → www.otodom.pl      · urn:site:otodompl      · pl
 *   România    → www.storia.ro      · urn:site:storiaro      · ro
 *
 * Nu conține niciun secret: credențialele de aplicație se citesc din
 * variabilele de mediu, exclusiv server-side.
 */

/** Host-ul portalului pentru fluxul de autorizare al agenției. */
export const STORIA_SITE_HOST = "www.storia.ro";
/** URN-ul de site cerut de API la publicare (Faza 3). */
export const STORIA_SITE_URN = "urn:site:storiaro";
/** Segmentul de limbă din URL-ul de autorizare. */
export const STORIA_LOCALE = "ro";

/** Pagina de autorizare CRM a portalului (browser-ul agenției ajunge aici). */
export const STORIA_AUTHORIZE_URL = `https://${STORIA_SITE_HOST}/${STORIA_LOCALE}/crm/authorization/`;

/** Baza API OLX Group. Doar HTTPS. */
export const OLX_API_BASE = "https://api.olxgroup.com";
/** Endpoint de emitere/reîmprospătare token. */
export const OLX_TOKEN_PATH = "/oauth/v1/token";

/** Ruta publică pe care o înregistrăm în Application Manager ca callback. */
export const STORIA_CALLBACK_PATH = "/api/public/portal/v1/storia/oauth/callback";

/** User-Agent identificabil, cerut explicit de documentația OLX. */
export const OLX_USER_AGENT = "HabitooCRM/1.0 (+https://crm.habitoo.ro)";

/** Timp de viață al `state`-ului CSRF (codul de autorizare expiră în 60s). */
export const STORIA_STATE_TTL_MS = 10 * 60 * 1000;

/** Marjă de siguranță la reîmprospătarea tokenului (access_token = 3600s). */
export const OLX_TOKEN_REFRESH_MARGIN_MS = 120 * 1000;
