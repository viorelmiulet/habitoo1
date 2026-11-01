/**
 * Gmail conectat de fiecare utilizator (App User Connector).
 *
 * Fiecare agent/admin își autorizeă propriul cont Google. Cheia de conexiune
 * (`lovack_*`) rămâne doar pe server, criptată în `app_user_connections`;
 * browserul primește exclusiv rezultatul unei citiri (adresa, numărul de
 * mesaje) sau starea „reconnectează".
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  appUserReconnectRequired,
  authorizeAppUserOAuth,
  callAsAppUser,
  disconnectAppUser,
  exchangeAppUserOAuthCode,
} from "@/integrations/lovable/appUserConnector";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  deleteConnectionKeyForUser,
  getConnectionKeyForUser,
  saveConnectionKeyForUser,
} from "@/lib/appUserConnections.server";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "google_mail";

/** Consimțământul cerut utilizatorului: citire + trimitere, plus identitatea. */
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

function clientApiKey(): string {
  const key = process.env["GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY"];
  if (!key) throw new Error("GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY is not set");
  return key;
}

export const startGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ authorizationUrl: string }> => {
    const request = getRequest();
    if (!request) throw new Error("OAuth must start from an app request.");
    const url = new URL(request.url);
    // x-forwarded-host e sanitizat de proxy doar pe localhost-ul sandbox-ului;
    // oriunde altundeva poate fi falsificat de client, deci rămânem la url.origin.
    const sandboxHost =
      url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const returnUrl = new URL(
      "/api/oauth/google-mail/return",
      sandboxHost ? `https://${sandboxHost}` : url.origin,
    ).toString();

    // Reconectare: cheia salvată confirmă deținerea conexiunii. Prima
    // conectare: getConnectionKeyForUser întoarce null, deci capul se omite.
    const connectionAPIKey = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);

    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId: CONNECTOR_ID,
      appUserId: context.userId,
      clientAPIKey: clientApiKey(),
      returnUrl,
      connectionAPIKey: connectionAPIKey ?? undefined,
      credentialsConfiguration: { scopes: GMAIL_SCOPES },
    });
    return { authorizationUrl };
  });

/** Browserul (fereastra care a deschis pop-up-ul) aduce codul de unică folosință. */
export const completeGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ code: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(
      GATEWAY_BASE_URL,
      data.code,
    );
    if (connectorId !== CONNECTOR_ID) {
      throw new Error("OAuth completion returned the wrong connector");
    }
    await saveConnectionKeyForUser(context.userId, connectorId, connectionAPIKey);
    return { ok: true };
  });

export type GmailStatus =
  | { connected: false; reconnectRequired: false }
  | { connected: false; reconnectRequired: true }
  | { connected: true; email: string; messagesTotal: number; threadsTotal: number };

export const getGmailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GmailStatus> => {
    const connectionAPIKey = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);
    if (!connectionAPIKey) return { connected: false, reconnectRequired: false };

    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey,
      connectorId: CONNECTOR_ID,
      path: "/gmail/v1/users/me/profile",
      requiredScopes: GMAIL_SCOPES,
    });
    if (await appUserReconnectRequired(res)) {
      return { connected: false, reconnectRequired: true };
    }
    if (!res.ok) {
      const body = await res.text();
      console.error(`Gmail profile lookup failed [${res.status}]: ${body}`);
      throw new Error(`Gmail profile lookup failed (${res.status})`);
    }
    const profile = (await res.json()) as {
      emailAddress?: string;
      messagesTotal?: number;
      threadsTotal?: number;
    };
    return {
      connected: true,
      email: profile.emailAddress ?? "",
      messagesTotal: profile.messagesTotal ?? 0,
      threadsTotal: profile.threadsTotal ?? 0,
    };
  });

export const disconnectGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const connectionAPIKey = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);
    if (!connectionAPIKey) return { ok: true };
    // Revocarea la Google întâi; rândul local se șterge doar dacă a reușit.
    await disconnectAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey,
      connectorId: CONNECTOR_ID,
    });
    await deleteConnectionKeyForUser(context.userId, CONNECTOR_ID);
    return { ok: true };
  });
