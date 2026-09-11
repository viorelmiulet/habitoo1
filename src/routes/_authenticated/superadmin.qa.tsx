import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  Building2,
  CalendarDays,
  Check,
  Copy,
  DatabaseZap,
  Eraser,
  FlaskConical,
  Flame,
  Images,
  KeyRound,
  ListChecks,
  RefreshCw,
  ShieldAlert,
  Target,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { ListSkeleton } from "@/components/app/LoadingState";
import { KpiCard } from "@/components/app/KpiCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getQaStatus, purgeQaDemo, rotateQaPasswords, seedQaDemo, type SeedResult } from "@/lib/qa.functions";
import type { DemoCredential } from "@/lib/qa-seed.server";
import { roleLabels } from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/superadmin/qa")({
  component: QaPanelPage,
});

const QA_QUERY_KEY = ["superadmin", "qa-status"] as const;

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function errorMessage(e: unknown) {
  if (e instanceof Error) return e.message;
  return "A apărut o eroare neașteptată.";
}

function QaPanelPage() {
  const queryClient = useQueryClient();
  const fetchStatus = useServerFn(getQaStatus);
  const seedFn = useServerFn(seedQaDemo);
  const rotateFn = useServerFn(rotateQaPasswords);
  const purgeFn = useServerFn(purgeQaDemo);

  const [credentials, setCredentials] = useState<DemoCredential[] | null>(null);
  const [lastSeed, setLastSeed] = useState<SeedResult | null>(null);
  const [purgeText, setPurgeText] = useState("");

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: QA_QUERY_KEY,
    queryFn: () => fetchStatus(),
    staleTime: 15_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: QA_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ["superadmin"] });
  };

  const seed = useMutation({
    mutationFn: (mode: "seed" | "reset") => seedFn({ data: { mode } }),
    onSuccess: (result) => {
      setLastSeed(result);
      setCredentials(result.credentials);
      invalidate();
      toast.success(
        result.mode === "reset"
          ? "Datele demo au fost resetate și repopulate."
          : "Agenția QA a fost populată cu date demo.",
      );
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const rotate = useMutation({
    mutationFn: () => rotateFn(),
    onSuccess: (result) => {
      setCredentials(result.credentials);
      toast.success("Parolele demo au fost regenerate.");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const purge = useMutation({
    mutationFn: () => purgeFn({ data: { confirmation: "ȘTERGE" } }),
    onSuccess: (result) => {
      setCredentials(null);
      setLastSeed(null);
      setPurgeText("");
      invalidate();
      toast.success(`Agenția „${result.organizationName}” a fost ștearsă (${result.deletedUsers} conturi demo eliminate).`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const busy = seed.isPending || rotate.isPending || purge.isPending;
  const org = data?.organization ?? null;
  const counts = data?.counts ?? null;
  const seeded = Boolean(org?.demo_seeded_at);

  return (
    <>
      <PageHeader
        title="QA / Demo Data"
        description="Agenție de test dedicată, izolată de agențiile reale, populată cu date fictive pentru testarea end-to-end a CRM-ului."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "size-4 animate-spin" : "size-4"} /> Reîmprospătează
          </Button>
        }
      />

      <Alert>
        <ShieldAlert className="size-4" />
        <AlertTitle>Protecții active</AlertTitle>
        <AlertDescription>
          Toate acțiunile de aici rulează exclusiv pentru superadmin, sunt verificate pe server și sunt scrise în jurnalul de
          audit. Resetarea și curățarea refuză, la nivel de bază de date, orice agenție care nu este marcată DEMO / QA.
        </AlertDescription>
      </Alert>

      {error ? (
        <div className="panel p-6">
          <EmptyState icon={ShieldAlert} title="Nu am putut încărca starea QA" description={errorMessage(error)} />
        </div>
      ) : isLoading ? (
        <div className="panel overflow-hidden"><ListSkeleton rows={4} /></div>
      ) : !org ? (
        <div className="panel p-6">
          <EmptyState
            icon={FlaskConical}
            title="Nu există încă o agenție QA"
            description="Creează agenția „Habitoo QA Demo” (marcată DEMO / QA) și populeaz-o automat cu 4 utilizatori, contacte, proprietăți cu fotografii, cereri, lead-uri în toate etapele, activități, calendar, obiective și notificări."
            action={
              <Button onClick={() => seed.mutate("seed")} disabled={busy}>
                <DatabaseZap className="size-4" /> {seed.isPending ? "Se populează…" : "Creează și populează agenția QA"}
              </Button>
            }
          />
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Bibliotecă foto demo disponibilă: {data?.library_photos ?? 0} imagini generate (fără drepturi de autor).
          </p>
        </div>
      ) : (
        <>
          <section className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-warning/20 text-warning-foreground">
                  <FlaskConical className="size-5" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{org.name}</h2>
                    <StatusBadge tone="warning">DEMO / QA</StatusBadge>
                    <StatusBadge tone={org.status === "active" ? "success" : "neutral"}>{org.status}</StatusBadge>
                    <StatusBadge tone="neutral">plan {org.plan}</StatusBadge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Slug <code className="rounded bg-muted px-1 py-0.5 text-xs">{org.slug}</code> · creată la{" "}
                    {fmtDateTime(org.created_at)}
                  </p>
                  <p className="mt-1 text-sm">
                    Ultimul seed:{" "}
                    <span className="font-medium">{seeded ? fmtDateTime(org.demo_seeded_at) : "niciodată"}</span>
                    {org.demo_seed_version ? (
                      <span className="text-muted-foreground"> · versiune {org.demo_seed_version}</span>
                    ) : null}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => seed.mutate("seed")} disabled={busy || seeded} title={seeded ? "Agenția este deja populată – folosește Resetare" : undefined}>
                  <DatabaseZap className="size-4" /> {seed.isPending && seed.variables === "seed" ? "Se populează…" : "Populează date demo"}
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" disabled={busy}>
                      <Eraser className="size-4" /> Resetare date demo
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Resetezi datele demo?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Toate contactele, proprietățile, fotografiile, cererile, lead-urile, activitățile, obiectivele și
                        notificările agenției <strong>{org.name}</strong> vor fi șterse și regenerate de la zero. Conturile
                        demo și parolele lor rămân neschimbate. Agențiile reale nu sunt afectate.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Renunță</AlertDialogCancel>
                      <AlertDialogAction onClick={() => seed.mutate("reset")}>Da, resetează</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <Button variant="outline" onClick={() => rotate.mutate()} disabled={busy || (counts?.users ?? 0) === 0}>
                  <KeyRound className="size-4" /> {rotate.isPending ? "Se regenerează…" : "Regenerează parolele"}
                </Button>

                <AlertDialog onOpenChange={(open) => !open && setPurgeText("")}>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={busy}>
                      <Trash2 className="size-4" /> Curăță agenția QA
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Ștergi complet agenția QA?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Agenția <strong>{org.name}</strong>, toate datele ei, fișierele din stocare și cele 4 conturi demo
                        vor fi eliminate definitiv. Operațiunea este refuzată pentru orice agenție care nu are marcajul
                        DEMO / QA. Scrie <strong>ȘTERGE</strong> pentru a confirma.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-1.5">
                      <Label htmlFor="purge-confirm">Confirmare</Label>
                      <Input
                        id="purge-confirm"
                        value={purgeText}
                        onChange={(e) => setPurgeText(e.target.value)}
                        placeholder="ȘTERGE"
                        autoComplete="off"
                      />
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Renunță</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={purgeText.trim().toUpperCase() !== "ȘTERGE" && purgeText.trim().toUpperCase() !== "STERGE"}
                        onClick={() => purge.mutate()}
                      >
                        Șterge definitiv
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </section>

          {counts ? (
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Utilizatori" value={counts.users} hint={`din ${org.max_users} permiși`} icon={Users} />
              <KpiCard label="Contacte" value={counts.contacts} icon={UserRound} tone="accent" />
              <KpiCard label="Proprietăți" value={counts.properties} hint={`${counts.property_images} fotografii`} icon={Building2} tone="info" />
              <KpiCard label="Cereri" value={counts.requests} icon={Target} tone="success" />
              <KpiCard label="Lead-uri" value={counts.leads} hint={`${counts.lead_events} evenimente în istoric`} icon={Flame} />
              <KpiCard label="Activități" value={counts.activities} icon={ListChecks} tone="accent" />
              <KpiCard label="Evenimente viitoare" value={counts.upcoming_events} hint="în calendar" icon={CalendarDays} tone="info" />
              <KpiCard label="Obiective · Notificări" value={`${counts.goals} · ${counts.notifications}`} icon={Images} tone="success" />
            </section>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="panel p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Users className="size-4" aria-hidden />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">Conturi demo</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Conturi reale create prin autentificarea existentă (email confirmat automat). Se autentifică din pagina de
                    login obișnuită.
                  </p>
                </div>
              </div>

              {data?.users.length ? (
                <ul className="mt-4 divide-y divide-border">
                  {data.users.map((u) => (
                    <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                          {(u.full_name ?? "?").slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{u.full_name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {u.email} {u.job_title ? `· ${u.job_title}` : ""}
                          </p>
                        </div>
                      </div>
                      <StatusBadge tone={u.role === "agency_admin" ? "primary" : "neutral"}>
                        {u.role === "unknown" ? "fără rol" : roleLabels[u.role]}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>

              ) : (
                <p className="mt-4 text-sm text-muted-foreground">Niciun cont demo încă.</p>
              )}

              {credentials ? (
                <div className="mt-4 rounded-lg border border-warning/40 bg-warning/10 p-3">
                  <p className="text-xs font-semibold text-warning-foreground">
                    Parole afișate o singură dată – nu sunt stocate nicăieri. Copiază-le acum.
                  </p>
                  <ul className="mt-2 space-y-2">
                    {credentials.map((c) => (
                      <CredentialRow key={c.email} credential={c} />
                    ))}
                  </ul>
                  {credentials.some((c) => !c.password) ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Conturile fără parolă afișată existau deja; folosește „Regenerează parolele” dacă nu le mai știi.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="panel p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/20 text-accent-foreground">
                  <ListChecks className="size-4" aria-hidden />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">Scenarii de test incluse în seed</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Fluxurile verificabile imediat după populare.
                  </p>
                </div>
              </div>
              <ol className="mt-4 space-y-3 text-sm">

                <li>
                  <p className="font-medium">A · Proprietate flagship</p>
                  <p className="text-muted-foreground">
                    RF-1001 „Apartament 3 camere, Aviației” – 6 fotografii, proprietar Ion Georgescu, 2 lead-uri interesate
                    (Bogdan Ilie, Alexandra Nistor), 2 cereri compatibile, vizionare efectuată + vizionare planificată.
                  </p>
                </li>
                <li>
                  <p className="font-medium">B · Pipeline lead-uri</p>
                  <p className="text-muted-foreground">
                    Lead „Bogdan Ilie” în etapa <em>Contactat</em> – poate fi mutat în <em>Calificat</em>, apoi{" "}
                    <em>Vizionare</em>; istoricul apare în cronologia lead-ului.
                  </p>
                </li>
                <li>
                  <p className="font-medium">C · Contact 360</p>
                  <p className="text-muted-foreground">
                    „Alexandra Nistor” – proprietar RF-1007, cerere de cumpărare, lead în vizionare, activități, WhatsApp și
                    vizionare efectuată.
                  </p>
                </li>
                <li>
                  <p className="font-medium">D · Matching</p>
                  <p className="text-muted-foreground">
                    Cererea „Ioana Vlad” (2–3 camere, Sector 6, ≤110.000 EUR, balcon + parcare + centrală) are cel puțin 3
                    proprietăți compatibile cu scoruri diferite (RF-1004, RF-1014, RF-1003, RF-1007).
                  </p>
                </li>
              </ol>

              {lastSeed ? (
                <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-xs">
                  <p className="font-semibold">Rezultatul ultimului seed ({lastSeed.mode === "reset" ? "resetare" : "populare"})</p>
                  <p className="mt-1 text-muted-foreground">
                    {lastSeed.summary.counts.contacts} contacte · {lastSeed.summary.counts.properties} proprietăți ·{" "}
                    {lastSeed.summary.counts.property_images} foto · {lastSeed.summary.counts.requests} cereri ·{" "}
                    {lastSeed.summary.counts.leads} lead-uri · {lastSeed.summary.counts.lead_events} evenimente istoric ·{" "}
                    {lastSeed.summary.counts.activities} activități ({lastSeed.summary.counts.upcoming_events} viitoare) ·{" "}
                    {lastSeed.summary.counts.goals} obiective · {lastSeed.summary.counts.notifications} notificări ·{" "}
                    {lastSeed.summary.counts.matches_over_60} potriviri ≥ 60%
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Scenariul D – top scoruri:{" "}
                    {lastSeed.summary.scenarios.D.top.map((t) => `${t.reference} ${t.score}%`).join(", ")}
                  </p>
                  {lastSeed.removed ? (
                    <p className="mt-1 text-muted-foreground">
                      Șterse la resetare:{" "}
                      {Object.entries(lastSeed.removed)
                        .filter(([, n]) => n > 0)
                        .map(([k, n]) => `${k} ${n}`)
                        .join(", ") || "nimic"}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
          </div>
        </>
      )}
    </>
  );
}

function CredentialRow({ credential }: { credential: DemoCredential }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!credential.password) return;
    try {
      await navigator.clipboard.writeText(`${credential.email} / ${credential.password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Nu am putut copia în clipboard.");
    }
  };
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface px-2.5 py-2 text-xs">
      <div className="min-w-0">
        <p className="truncate font-medium">
          {credential.full_name} <span className="font-normal text-muted-foreground">· {roleLabels[credential.role]}</span>
        </p>
        <p className="truncate font-mono text-muted-foreground">{credential.email}</p>
        <p className="font-mono">{credential.password ?? "(parolă existentă – neschimbată)"}</p>
      </div>
      {credential.password ? (
        <Button size="sm" variant="ghost" onClick={copy} aria-label="Copiază datele de autentificare">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      ) : null}
    </li>
  );
}
