import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { CheckCircle2, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { Container, Section } from "@/components/marketing/Section";
import { publicHead } from "@/components/marketing/public-head";
import { formatDateTime } from "@/lib/format";
import {
  previewAccessRequestByToken,
  respondAccessRequestByToken,
  revokeAccessByToken,
  type TokenPreview,
  type TokenRespond,
} from "@/lib/impersonation-token.functions";

const TITLE = "Cerere de acces la contul tău — Habitoo CRM";
const DESCRIPTION =
  "Aprobă sau respinge cererea echipei Habitoo de a accesa temporar contul tău, direct din link, fără autentificare.";

const searchSchema = z.object({
  id: z.string().uuid().optional(),
  token: z.string().optional(),
  actiune: z.enum(["aprob", "resping"]).optional(),
});

export const Route = createFileRoute("/acces-cont")({
  // Pagină publică: linkul din email trebuie să funcționeze și fără sesiune.
  validateSearch: (search) => searchSchema.parse(search),
  head: () => publicHead({ path: "/acces-cont", title: TITLE, description: DESCRIPTION, noindex: true }),
  component: AccessRequestPage,
});

function AccessRequestPage() {
  const { id, token, actiune } = Route.useSearch();
  const preview = useServerFn(previewAccessRequestByToken);
  const respond = useServerFn(respondAccessRequestByToken);
  const revoke = useServerFn(revokeAccessByToken);

  const [state, setState] = useState<TokenPreview | null>(null);
  const [result, setResult] = useState<TokenRespond | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [busy, setBusy] = useState(false);

  // Nu acționăm automat la deschiderea linkului: tokenul se consumă doar la
  // apăsarea explicită a butonului, ca scanerele de email să nu îl folosească.
  useEffect(() => {
    if (!id || !token) return;
    void preview({ data: { id, token } }).then(setState);
  }, [id, token, preview]);

  const act = async (accept: boolean) => {
    if (!id || !token) return;
    setBusy(true);
    try {
      setResult(await respond({ data: { id, token, accept } }));
    } finally {
      setBusy(false);
    }
  };

  const doRevoke = async () => {
    if (!id || !result || !result.ok || !result.revokeToken) return;
    setBusy(true);
    try {
      const r = await revoke({ data: { id, token: result.revokeToken } });
      setRevoked(r.ok);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicLayout>
      <Section>
        <Container className="max-w-2xl">
          <h1 className="font-display text-3xl">Cerere de acces la contul tău</h1>

          {!id || !token ? (
            <Alert className="mt-6">
              <ShieldAlert className="size-4" />
              <AlertTitle>Link incomplet</AlertTitle>
              <AlertDescription>
                Deschide linkul exact așa cum l-ai primit pe email. Dacă nu mai funcționează, poți
                răspunde cererii din aplicație, în Setări → Acces la cont.
              </AlertDescription>
            </Alert>
          ) : result ? (
            <ResultView result={result} revoked={revoked} busy={busy} onRevoke={doRevoke} />
          ) : state === null ? (
            <p className="mt-6 text-sm text-muted-foreground">Se verifică linkul…</p>
          ) : !state.ok ? (
            <Alert className="mt-6">
              <ShieldAlert className="size-4" />
              <AlertTitle>Link invalid sau expirat</AlertTitle>
              <AlertDescription>
                Linkul a fost deja folosit sau nu mai este valabil. Nimeni nu are acces la contul tău
                pe baza lui.
              </AlertDescription>
            </Alert>
          ) : state.used || state.status !== "pending" ? (
            <Alert className="mt-6">
              <ShieldCheck className="size-4" />
              <AlertTitle>Cererea a fost deja închisă</AlertTitle>
              <AlertDescription>
                Ai răspuns deja acestei cereri sau ea a expirat. Poți verifica oricând starea în
                aplicație, în Setări → Acces la cont.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="mt-6 space-y-4">
              <div className="panel space-y-2 p-5 text-sm">
                <p>
                  <strong>{state.superadminName || "Un superadmin Habitoo"}</strong> cere acces
                  temporar la contul tău.
                </p>
                <p>Motivul indicat: {state.reasonText}</p>
                <p className="text-muted-foreground">
                  Cerută la {formatDateTime(state.requestedAt)} · cererea expiră la{" "}
                  {formatDateTime(state.expiresAt)}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Dacă aprobi, accesul durează 24 de ore și expiră automat. Parola, emailul și modul de
                autentificare nu pot fi schimbate în acest timp, fiecare acțiune este jurnalizată și
                poți revoca accesul oricând.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => void act(true)}
                  disabled={busy}
                  autoFocus={actiune === "aprob"}
                >
                  Aprob accesul pentru 24 de ore
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void act(false)}
                  disabled={busy}
                  autoFocus={actiune === "resping"}
                >
                  Respinge cererea
                </Button>
              </div>
            </div>
          )}
        </Container>
      </Section>
    </PublicLayout>
  );
}

function ResultView({
  result,
  revoked,
  busy,
  onRevoke,
}: {
  result: TokenRespond;
  revoked: boolean;
  busy: boolean;
  onRevoke: () => void;
}) {
  if (!result.ok) {
    return (
      <Alert className="mt-6">
        <ShieldAlert className="size-4" />
        <AlertTitle>Linkul nu mai poate fi folosit</AlertTitle>
        <AlertDescription>
          {result.reason === "used"
            ? "Acest link a fost deja folosit o dată."
            : result.reason === "closed"
              ? "Cererea nu mai este în așteptare."
              : "Linkul este invalid sau expirat."}{" "}
          Nimeni nu a primit acces pe baza lui acum.
        </AlertDescription>
      </Alert>
    );
  }

  if (revoked) {
    return (
      <Alert className="mt-6">
        <XCircle className="size-4" />
        <AlertTitle>Accesul a fost revocat</AlertTitle>
        <AlertDescription>
          Sesiunea s-a închis imediat. Nimeni nu mai poate intra în contul tău.
        </AlertDescription>
      </Alert>
    );
  }

  if (!result.accepted) {
    return (
      <Alert className="mt-6">
        <XCircle className="size-4" />
        <AlertTitle>Ai respins cererea</AlertTitle>
        <AlertDescription>
          Nimeni nu are acces la contul tău. Am anunțat echipa Habitoo despre decizia ta.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <Alert>
        <CheckCircle2 className="size-4" />
        <AlertTitle>Ai aprobat accesul</AlertTitle>
        <AlertDescription>
          <span className="block">
            {result.superadminName || "Un superadmin Habitoo"} poate lucra în contul tău până la{" "}
            {result.expiresAt ? formatDateTime(result.expiresAt) : "expirarea celor 24 de ore"}.
          </span>
          <span className="block">Motivul aprobat: {result.reasonText}</span>
          <span className="block">
            Parola, emailul și modul de autentificare rămân blocate, iar fiecare acțiune este
            jurnalizată.
          </span>
        </AlertDescription>
      </Alert>
      <Button variant="outline" onClick={onRevoke} disabled={busy}>
        Revocă accesul acum
      </Button>
      <p className="text-xs text-muted-foreground">
        Poți revoca oricând și din aplicație, în Setări → Acces la cont.
      </p>
    </div>
  );
}
