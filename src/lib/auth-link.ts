import { supabase } from "@/integrations/supabase/client";

/**
 * Tratarea linkurilor de autentificare primite pe email
 * (resetare parolă, invitație agent, confirmare cont).
 *
 * Parametrii sosesc de la Supabase fie în hash (`#access_token=...&type=recovery`),
 * fie în query (`?token_hash=...` sau `?code=...`). Îi citim SINCRON, înainte de
 * orice apel către clientul Supabase (creat lazy), ca detectarea automată din URL
 * să nu consume tokenul în paralel. Sesiunea existentă în browser este curățată
 * local înainte de a aplica tokenul din link, ca linkul să aibă mereu prioritate
 * (altfel „merge doar în incognito”).
 */

export type AuthLinkParams = {
  accessToken?: string;
  refreshToken?: string;
  tokenHash?: string;
  code?: string;
  type?: string;
  errorCode?: string;
  errorDescription?: string;
  /** Linkul conține vreun parametru de autentificare? */
  present: boolean;
};

const EMPTY: AuthLinkParams = { present: false };

/**
 * Parametrii citiți o singură dată pe încărcare de pagină: hash-ul este șters
 * imediat, iar efectele React pot rula de două ori (StrictMode) fără să piardă
 * tokenul.
 */
let captured: AuthLinkParams | null = null;

/** Citește parametrii din hash + query și curăță URL-ul (fără reload). */
export function readAuthLinkParams(): AuthLinkParams {
  if (typeof window === "undefined") return EMPTY;
  if (captured) return captured;


  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  const fromHash = new URLSearchParams(hash);
  const fromQuery = new URLSearchParams(window.location.search);
  const pick = (key: string) => fromHash.get(key) ?? fromQuery.get(key) ?? undefined;

  const params: AuthLinkParams = {
    accessToken: pick("access_token"),
    refreshToken: pick("refresh_token"),
    tokenHash: pick("token_hash") ?? pick("token"),
    code: pick("code"),
    type: pick("type"),
    errorCode: pick("error_code") ?? pick("error"),
    errorDescription: pick("error_description")?.replace(/\+/g, " "),
    present: false,
  };
  params.present = Boolean(
    params.accessToken || params.tokenHash || params.code || params.errorCode,
  );

  // Scoatem tokenul din bara de adrese ca să nu rămână în istoric / referrer.
  if (hash && params.present) {
    try {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    } catch {
      /* history indisponibil */
    }
  }

  captured = params;
  return params;

}

export type AuthLinkResult = { ok: true } | { ok: false; message: string };

const EXPIRED_MESSAGE = "Linkul a expirat sau este invalid. Solicită unul nou.";

function messageFor(code?: string | null, description?: string | null): string {
  const m = `${code ?? ""} ${description ?? ""}`.toLowerCase();
  if (m.includes("expired") || m.includes("invalid") || m.includes("access_denied")) {
    return EXPIRED_MESSAGE;
  }
  if (m.includes("code verifier") || m.includes("code_verifier") || m.includes("flow state")) {
    return "Deschide linkul în același browser din care ai cerut emailul, sau solicită un link nou.";
  }
  return EXPIRED_MESSAGE;
}

/**
 * Aplică tokenul din link ca sesiune activă. Sesiunea veche (chiar expirată sau
 * parțială) este ștearsă local înainte, ca să nu intre în conflict cu tokenul nou.
 * Rezultatul este memoizat: dacă efectul rulează de două ori, nu ștergem sesiunea
 * abia creată din link.
 */
let inFlight: Promise<AuthLinkResult> | null = null;

export function establishSessionFromLink(params: AuthLinkParams): Promise<AuthLinkResult> {
  if (!inFlight) inFlight = runLinkExchange(params);
  return inFlight;
}

async function runLinkExchange(params: AuthLinkParams): Promise<AuthLinkResult> {
  if (params.errorCode) {
    return { ok: false, message: messageFor(params.errorCode, params.errorDescription) };
  }
  if (!params.present) {
    // Fără parametri în link: sesiunea existentă (ex. recovery deja aplicat) decide.
    const { data } = await supabase.auth.getSession();
    return data.session ? { ok: true } : { ok: false, message: EXPIRED_MESSAGE };
  }

  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    /* fără sesiune de curățat */
  }

  const fail = async (code?: string | null, message?: string | null): Promise<AuthLinkResult> => {
    // Chiar dacă apelul a raportat eroare, o sesiune validă venită din link e suficientă.
    const { data } = await supabase.auth.getSession();
    if (data.session) return { ok: true };
    return { ok: false, message: messageFor(code, message) };
  };

  try {
    if (params.accessToken && params.refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: params.accessToken,
        refresh_token: params.refreshToken,
      });
      if (error) return fail(error.code, error.message);
      return { ok: true };
    }

    if (params.tokenHash) {
      const type = (params.type ?? "recovery") as "recovery" | "signup" | "invite" | "email";
      const { error } = await supabase.auth.verifyOtp({
        type,
        token_hash: params.tokenHash,
      });
      if (error) return fail(error.code, error.message);
      return { ok: true };
    }

    if (params.code) {
      const { error } = await supabase.auth.exchangeCodeForSession(params.code);
      if (error) return fail(error.code, error.message);
      return { ok: true };
    }
  } catch (err) {
    return fail(null, err instanceof Error ? err.message : String(err));
  }

  return { ok: false, message: EXPIRED_MESSAGE };
}


export { EXPIRED_MESSAGE };
