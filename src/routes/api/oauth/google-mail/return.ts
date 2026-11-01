/**
 * Pop-up-ul de consent Google se întoarce aici.
 *
 * Endpoint de server care randează HTML simplu, fără autentificare: în
 * previzualizarea din editor fereastra pop-up nu are sesiunea aplicației,
 * deci nu poate încărca o rută protejată. Query string-ul poartă `code`-ul
 * de unică folosință, care este postat doar către fereastra care a deschis
 * pop-up-ul, pe aceeași origine; schimbul în cheia de conexiune face un server
 * function autentificat, nu această pagină.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/oauth/google-mail/return")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const connectorId = url.searchParams.get("connector_id") ?? "";
        const code = url.searchParams.get("code") ?? "";
        const success = url.searchParams.get("success") === "true";
        const offlineAccessAllowed = url.searchParams.get("offline_access_allowed");
        const error = url.searchParams.get("error");

        const result =
          success && offlineAccessAllowed === "false"
            ? { success: true, connectorId, code: null }
            : success && code
              ? { success: true, connectorId, code }
              : {
                  success: false,
                  connectorId,
                  error: error ?? (success ? "Missing code" : "OAuth failed"),
                };

        const escapeHtml = (str: string) =>
          str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");

        // Evită ieșirea din <script> prin secvența </script>.
        const safeJson = JSON.stringify(result).replace(/<\//g, "<\\/");

        const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Finisăm conectarea…</title></head>
<body>
  <p>${result.success ? "Conectare finalizată, poți închide fereastra." : "Conectarea nu a reușit: " + escapeHtml(result.error ?? "eroare necunoscută")}</p>
  <script>
    const result = ${safeJson};
    const type = result.success ? "appUserConnectorOAuthComplete" : "appUserConnectorOAuthFailed";
    const message = {
      type,
      connectorId: result.connectorId,
      code: result.code ?? null
    };

    // Doar fereastra care a deschis pop-up-ul, pe aceeași origine.
    if (window.opener && window.opener !== window) {
      window.opener.postMessage(message, window.location.origin);
    }
    window.close();
  </script>
</body>
</html>`;

        return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      },
    },
  },
});
