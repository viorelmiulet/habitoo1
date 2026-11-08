import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { connectExtension } from "@/lib/extension.functions";
import { EXTENSION_MESSAGE_TYPE, isValidNonce } from "@/lib/extension/core";

export const Route = createFileRoute("/_authenticated/app/extensie/conectare")({
  validateSearch: (s: Record<string, unknown>) => ({ nonce: typeof s.nonce === "string" ? s.nonce : undefined }),
  head: () => ({ meta: [{ title: "Conectează extensia Habitoo Captură" }, { name: "robots", content: "noindex" }] }),
  component: ConnectExtensionPage,
});

type State = "idle" | "working" | "done" | "denied" | "error";

function ConnectExtensionPage() {
  const { nonce } = Route.useSearch();
  const connect = useServerFn(connectExtension);
  const [state, setState] = useState<State>("idle");
  const valid = isValidNonce(nonce);

  async function allow() {
    if (!isValidNonce(nonce)) return;
    setState("working");
    try {
      const { token } = await connect({ data: { nonce } });
      // Tokenul nu intră în stare, pe ecran sau în loguri — merge direct la extensie.
      window.postMessage({ type: EXTENSION_MESSAGE_TYPE, nonce, token }, window.location.origin);
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Conectează extensia Habitoo Captură</h1>
        {!valid ? (
          <p className="mt-4 text-sm text-destructive">Link de conectare invalid. Pornește conectarea din nou din extensie.</p>
        ) : state === "done" ? (
          <p className="mt-4 text-sm" role="status">Extensia a fost conectată, poți închide fila.</p>
        ) : state === "denied" ? (
          <p className="mt-4 text-sm" role="status">Ai refuzat accesul. Poți închide fila.</p>
        ) : (
          <>
            <p className="mt-4 text-sm text-muted-foreground">
              Extensia Habitoo Captură cere acces la contul tău: creează proprietăți ciornă și contacte în numele tău și citește anunțurile tale active
            </p>
            {state === "error" && <p className="mt-3 text-sm text-destructive">Nu am putut conecta extensia. Încearcă din nou.</p>}
            <div className="mt-6 flex gap-3">
              <Button onClick={allow} disabled={state === "working"}>Permite</Button>
              <Button variant="outline" onClick={() => setState("denied")} disabled={state === "working"}>Refuză</Button>
            </div>
          </>
        )}
        <p className="mt-6 text-xs text-muted-foreground">
          Dispozitivele conectate se gestionează în <Link to="/app/settings" search={{ tab: "profile" } as never} className="underline">Setări → Profil</Link>.
        </p>
      </div>
    </div>
  );
}
