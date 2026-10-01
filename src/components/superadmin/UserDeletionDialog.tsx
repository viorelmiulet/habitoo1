import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PortalLogoStack } from "@/components/app/PortalLogo";
import { toast } from "@/components/ui/sonner";
import { roleLabels } from "@/lib/labels";
import { portalDisplayName, type PortalId } from "@/lib/portals/registry";
import type { PlatformUser } from "@/lib/superadmin-users.functions";
import { getAccountDeletionJob, getUserDeletionPreview, startAccountDeletionJob } from "@/lib/account-deletion.functions";
import { canConfirmDeletion, deletionJobMode, groupDeletionDestinations, hasAssignedData, type DeletionChoice } from "@/lib/user-deletion";
import { cn } from "@/lib/utils";

const CHIP_KEYS: [string, string][] = [
  ["properties", "proprietăți"],
  ["leads", "lead-uri"],
  ["contacts", "contacte"],
  ["activities", "activități"],
];

export function UserDeletionDialog({ user, users, onClose }: { user: PlatformUser | null; users: PlatformUser[]; onClose: () => void }) {
  return (
    <Dialog open={user !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[18px]">
        {user ? <DeletionBody key={user.id} user={user} users={users} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function DeletionBody({ user, users, onClose }: { user: PlatformUser; users: PlatformUser[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const loadPreview = useServerFn(getUserDeletionPreview);
  const start = useServerFn(startAccountDeletionJob);
  const [choice, setChoice] = useState<DeletionChoice>(null);
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  const preview = useQuery({ queryKey: ["user-deletion-preview", user.id], queryFn: () => loadPreview({ data: { userId: user.id } }) });
  const workload = preview.data?.workload ?? null;
  const hasData = hasAssignedData(workload);
  const groups = groupDeletionDestinations(users, user.id);
  const destination = users.find((u) => u.id === destinationId) ?? null;
  const withdrawTotal = (preview.data?.withdrawals ?? []).reduce((s, w) => s + w.count, 0);
  const role = user.roles.map((r) => roleLabels[r as keyof typeof roleLabels] ?? r).join(", ");
  const orgName = preview.data?.organizationName ?? user.organization_name;

  const submit = async () => {
    if (!workload) return;
    setPending(true);
    setError(null);
    try {
      const mode = deletionJobMode(workload, choice);
      const r = await start({ data: { kind: "user", targetId: user.id, mode, reassignToUserId: mode === "reassign" ? destinationId : null } });
      setJobId(r.jobId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  if (jobId) {
    return <DeletionProgress jobId={jobId} name={user.full_name} onClose={() => { void queryClient.invalidateQueries({ queryKey: ["superadmin", "users"] }); onClose(); }} lastMember={user.organization_id !== null && preview.data?.otherMembers === 0} orgName={orgName} />;
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-display">Șterge utilizatorul {user.full_name}</DialogTitle>
        <DialogDescription>{[orgName ?? "Fără agenție", role].filter(Boolean).join(" · ")}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        {workload ? (
          <div className="flex flex-wrap gap-2" aria-label="Date asignate">
            {CHIP_KEYS.map(([k, label]) => (
              <span key={k} className="inline-flex h-7 items-center rounded-full border border-border px-3 text-xs">{Number(workload[k] ?? 0)} {label}</span>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">Se verifică datele asignate…</p>}

        {workload && hasData ? (
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-semibold">Ce faci cu proprietățile și lead-urile?</legend>
            <ChoiceButton active={choice === "reassign"} onClick={() => setChoice("reassign")}>Realocă altui utilizator</ChoiceButton>
            {choice === "reassign" ? (
              <div className="grid gap-1.5 pl-1">
                <Label>Utilizatorul care preia datele</Label>
                <Select value={destinationId ?? undefined} onValueChange={(v) => { setDestinationId(v); setError(null); }}>
                  <SelectTrigger className="min-h-11"><SelectValue placeholder="Alege un utilizator" /></SelectTrigger>
                  <SelectContent>
                    {groups.map((g) => (
                      <SelectGroup key={g.organizationId}>
                        <SelectLabel>{g.organizationName}</SelectLabel>
                        {g.users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                {destination && destination.organization_id !== user.organization_id ? (
                  <p className="text-sm text-muted-foreground">Datele se mută în agenția {destination.organization_name}. Anunțurile de pe portaluri ale agenției {orgName} se retrag ({withdrawTotal}).</p>
                ) : null}
              </div>
            ) : null}
            <ChoiceButton active={choice === "delete"} onClick={() => { setChoice("delete"); setError(null); }}>Șterge definitiv datele</ChoiceButton>
            {choice === "delete" ? (
              <div className="grid gap-2 pl-1 text-sm">
                <p>Se șterg {Number(workload.properties ?? 0)} proprietăți cu pozele lor ({preview.data?.images ?? 0}), {Number(workload.leads ?? 0)} lead-uri și istoricul lor.</p>
                {preview.data?.withdrawals.length ? (
                  <ul className="grid gap-1.5">
                    {preview.data.withdrawals.map((w) => (
                      <li key={w.portal} className="flex items-center gap-2">
                        <PortalLogoStack portalId={w.portal as PortalId} name={portalDisplayName(w.portal as PortalId)} size={24} className="shrink-0" />
                        <span>{portalDisplayName(w.portal as PortalId)}: se retrag întâi {w.count}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </fieldset>
        ) : null}

        {user.organization_id && preview.data?.otherMembers === 0 ? (
          <p className="text-sm">Agenția {orgName} rămâne fără membri. O poți șterge din <Link to="/superadmin/agencies" className="underline">Agenții</Link>.</p>
        ) : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <p className="rounded-2xl bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground">Acțiunea nu poate fi anulată.</p>
      </div>
      <DialogFooter>
        <Button variant="outline" className="min-h-11" onClick={onClose}>Renunță</Button>
        <Button variant="destructive" className="min-h-11" disabled={!canConfirmDeletion({ workload, choice, destinationId, pending })} onClick={() => void submit()}>Șterge definitiv</Button>
      </DialogFooter>
    </>
  );
}

function ChoiceButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cn("min-h-11 rounded-2xl border px-4 text-left text-sm font-medium", active ? "border-sidebar bg-sidebar text-sidebar-foreground" : "border-border")}>
      {children}
    </button>
  );
}

type JobReport = { withdrawn?: number; manual?: { propertyId: string; reference: string | null; portal: string; url: string | null }[] };

function DeletionProgress({ jobId, name, onClose, lastMember, orgName }: { jobId: string; name: string; onClose: () => void; lastMember: boolean; orgName: string | null }) {
  const load = useServerFn(getAccountDeletionJob);
  const job = useQuery({
    queryKey: ["account-deletion-job", jobId],
    queryFn: () => load({ data: { jobId } }),
    refetchInterval: (q) => (["queued", "running"].includes(q.state.data?.status ?? "queued") ? 2_000 : false),
  });
  const j = job.data;
  const report = (j?.report ?? {}) as JobReport;
  const total = j?.total ?? 0;
  const done = j?.done ?? 0;
  const finished = j?.status === "done";
  const failed = j?.status === "failed";
  if (finished && job.isFetchedAfterMount && !sessionStorage.getItem(`deletion-toast-${jobId}`)) {
    sessionStorage.setItem(`deletion-toast-${jobId}`, "1");
    toast.success(`Contul ${name} a fost șters.`);
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-display">Ștergere: {name}</DialogTitle>
        <DialogDescription>Operația rulează în fundal; poți închide fereastra. Rezultatul apare în Audit.</DialogDescription>
      </DialogHeader>
      <div role="status" aria-live="polite" className="grid gap-3 text-sm">
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${total ? Math.round((done / total) * 100) : finished ? 100 : 0}%` }} />
        </div>
        <p>{finished ? "Finalizat" : failed ? "Oprit cu eroare" : "În curs"} · {done} din {total} proprietăți · {report.withdrawn ?? 0} retrase</p>
        {failed ? <p className="text-destructive">{JSON.stringify((j?.errors ?? []).slice(-1)[0] ?? "Eroare necunoscută")}</p> : null}
        {report.manual?.length ? (
          <div className="grid gap-1">
            <p className="font-semibold">Retragere manuală necesară:</p>
            <ul className="grid gap-1">
              {report.manual.map((m) => (
                <li key={`${m.propertyId}-${m.portal}`}>
                  {m.reference ?? m.propertyId} · {portalDisplayName(m.portal as PortalId)}{" "}
                  {m.url ? <a href={m.url} target="_blank" rel="noreferrer" className="underline">Deschide anunțul</a> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {finished && lastMember ? <p>Agenția {orgName} rămâne fără membri. O poți șterge din <Link to="/superadmin/agencies" className="underline">Agenții</Link>.</p> : null}
      </div>
      <DialogFooter>
        <Button variant="outline" className="min-h-11" onClick={onClose}>Închide</Button>
      </DialogFooter>
    </>
  );
}
