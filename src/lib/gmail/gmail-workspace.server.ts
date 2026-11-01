/**
 * Gmail-ul Habitoos (contul workspace-ului), prin gateway-ul de conectoare.
 *
 * Server-only: `LOVABLE_API_KEY` și `GOOGLE_MAIL_API_KEY` sunt secrete și se
 * citesc exclusiv din `process.env`, în interiorul funcțiilor (runtime-ul
 * Worker le poate schimba între cereri). Browserul nu primește niciodată
 * cheile, ci doar rezultatul unei citiri.
 */
const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "google_mail";

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

/** Doar nume de piese lipsă, niciodată valori. */
export function workspaceGmailConfigStatus(): { configured: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!readEnv("LOVABLE_API_KEY")) missing.push("LOVABLE_API_KEY");
  if (!readEnv("GOOGLE_MAIL_API_KEY")) missing.push("GOOGLE_MAIL_API_KEY");
  return { configured: missing.length === 0, missing };
}

export type WorkspaceGmailProfile = {
  email: string;
  messagesTotal: number;
  threadsTotal: number;
};

/** Citire de profil pe contul Habitoos; arunca dacă gateway-ul refuză. */
export async function readWorkspaceGmailProfile(): Promise<WorkspaceGmailProfile> {
  const { configured, missing } = workspaceGmailConfigStatus();
  if (!configured) {
    throw new Error(`Gmail workspace not configured (missing: ${missing.join(", ")})`);
  }
  const res = await fetch(`${GATEWAY_BASE_URL}/${CONNECTOR_ID}/gmail/v1/users/me/profile`, {
    headers: {
      Authorization: `Bearer ${readEnv("LOVABLE_API_KEY")}`,
      "X-Connection-Api-Key": readEnv("GOOGLE_MAIL_API_KEY"),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Workspace Gmail profile lookup failed [${res.status}]: ${body}`);
    throw new Error(`Workspace Gmail profile lookup failed (${res.status})`);
  }
  const profile = (await res.json()) as {
    emailAddress?: string;
    messagesTotal?: number;
    threadsTotal?: number;
  };
  return {
    email: profile.emailAddress ?? "",
    messagesTotal: profile.messagesTotal ?? 0,
    threadsTotal: profile.threadsTotal ?? 0,
  };
}
