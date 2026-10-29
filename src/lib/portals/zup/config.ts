export const ZUP_BASE = "https://zup.ro/zapi/v1/";
export const ZUP_AUTHORIZE = "https://zup.ro/oauth/authorize";
export const ZUP_CALLBACK = "https://crm.habitoo.ro/api/public/portal/v1/zup/oauth/callback";
export const ZUP_TIMEOUT_MS = 30_000;
export const ZUP_MISSING_MESSAGE = "Integrarea ZUP nu este configurată la nivel de platformă";
export function zupConfigured(env: Record<string, string | undefined>): boolean {
  return Boolean(env["ZUP_CLIENT_ID"]?.trim() && env["ZUP_CLIENT_SECRET"]?.trim());
}
export function zupPublicationBlocked(): true { return true; }