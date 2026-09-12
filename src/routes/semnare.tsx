import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CheckCircle2, FileText, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { toastError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { SignaturePad } from "@/components/app/contracts/SignaturePad";
import { publicHead } from "@/components/marketing/public-head";
import { getSignatureRequest, submitSignature } from "@/lib/contracts-sign.functions";

export const Route = createFileRoute("/semnare")({
  head: () =>
    publicHead({
      path: "/semnare",
      title: "Semnează documentul — Habitoo CRM",
      description: "Pagină securizată pentru semnarea electronică a documentelor imobiliare.",
      noindex: true,
    }),
  validateSearch: (search: Record<string, unknown>): { t?: string } => ({
    t: typeof search["t"] === "string" ? search["t"] : undefined,
  }),
  component: SignPage,
});

const stateMessages: Record<string, { title: string; text: string }> = {
  invalid: {
    title: "Link invalid",
    text: "Linkul nu este valid. Cere agentului un link nou de semnare.",
  },
  used: {
    title: "Link folosit",
    text: "Acest link a fost deja folosit. Documentul semnat ți-a fost trimis pe email.",
  },
  expired: {
    title: "Link expirat",
    text: "Linkul a fost valabil 7 zile. Cere agentului un link nou.",
  },
  cancelled: {
    title: "Document anulat",
    text: "Documentul a fost anulat de agenție și nu mai poate fi semnat.",
  },
};

function SignPage() {
  const { t } = Route.useSearch();
  const fetchRequest = useServerFn(getSignatureRequest);
  const runSubmit = useServerFn(submitSignature);
  const [signature, setSignature] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [done, setDone] = useState(false);

  const request = useQuery({
    queryKey: ["signature-request", t],
    enabled: Boolean(t),
    queryFn: () => fetchRequest({ data: { token: t! } }),
  });

  const submit = useMutation({
    mutationFn: () =>
      runSubmit({
        data: { token: t!, signaturePngBase64: signature!, agreed: true as const },
      }),
    onSuccess: () => setDone(true),
    onError: (e: Error) => toastError(e),
  });

  const view = request.data;

  return (
    <main className="flex min-h-screen flex-col items-center bg-muted/40 px-4 py-10">
      <BrandLogo className="mb-8 h-9 w-auto" />
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        {!t ? (
          <Notice
            tone="warning"
            title="Link incomplet"
            text="Deschide linkul exact așa cum l-ai primit pe email."
          />
        ) : request.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Se verifică linkul…
          </p>
        ) : !view ? (
          <Notice
            tone="warning"
            title="Link invalid"
            text="Linkul nu a putut fi verificat. Încearcă din nou mai târziu."
          />
        ) : "contractTitle" in view === false ? (
          <Notice
            tone="warning"
            title={stateMessages[view.state]?.title ?? "Link indisponibil"}
            text={stateMessages[view.state]?.text ?? "Cere agentului un link nou de semnare."}
          />
        ) : done || view.state === "signed" ? (
          <Notice
            tone="success"
            title="Document semnat"
            text="Semnătura a fost înregistrată. Vei primi documentul semnat pe email."
          />
        ) : (
          <div className="space-y-6">
            <header className="space-y-1">
              <p className="text-xs font-semibold tracking-wide text-primary uppercase">
                {view.contractKind} · {view.agencyName}
              </p>
              <h1 className="text-xl font-semibold sm:text-2xl">{view.contractTitle}</h1>
              <p className="text-sm text-muted-foreground">
                Semnezi în calitate de <strong>{view.partyRole.toLowerCase()}</strong>:{" "}
                {view.partyName}
              </p>
            </header>

            {view.documentUrl ? (
              <a
                href={view.documentUrl}
                target="_blank"
                rel="noopener"
                className="flex items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-muted/60"
              >
                <FileText className="size-5 text-primary" />
                <span className="text-sm font-medium">
                  Citește documentul (PDF)
                  <span className="block text-xs font-normal text-muted-foreground">
                    Se deschide într-o pagină nouă
                  </span>
                </span>
              </a>
            ) : null}

            <div className="space-y-3">
              <h2 className="text-sm font-semibold">Semnătura ta</h2>
              <SignaturePad onChange={setSignature} />
            </div>

            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                checked={agreed}
                onCheckedChange={(checked) => setAgreed(checked === true)}
                className="mt-0.5"
              />
              <span className="text-muted-foreground">
                Am citit documentul, sunt de acord cu conținutul lui și accept semnarea
                electronică. Data, ora și adresa IP vor fi înregistrate ca dovadă a semnării.
              </span>
            </label>

            <Button
              className="w-full"
              size="lg"
              disabled={!signature || !agreed || submit.isPending}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Semnează
              documentul
            </Button>

            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              Linkul este personal, valabil 7 zile și poate fi folosit o singură dată.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

function Notice({
  tone,
  title,
  text,
}: {
  tone: "success" | "warning";
  title: string;
  text: string;
}) {
  const Icon = tone === "success" ? CheckCircle2 : TriangleAlert;
  return (
    <div className="space-y-2 text-center">
      <Icon
        className={`mx-auto size-10 ${tone === "success" ? "text-success" : "text-warning-foreground"}`}
      />
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
