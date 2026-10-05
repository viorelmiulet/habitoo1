import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRightLeft, KeyRound, LogIn, Pencil, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UserAvatarEditor } from "@/components/superadmin/UserAvatarEditor";
import { UserDeletionDialog } from "@/components/superadmin/UserDeletionDialog";
import { ImpersonationRequestDialog } from "@/components/app/ImpersonationRequestDialog";
import { listMyImpersonationRequests } from "@/lib/impersonation.functions";
import { setImpersonationId } from "@/lib/impersonation-client";
import { reassignUserData, setPlatformUserActive, updatePlatformUser, type PlatformUser } from "@/lib/superadmin-users.functions";

const workloadLabels: Record<string, string> = { properties: "proprietăți", leads: "lead-uri", activities: "activități", requests: "cereri", contacts: "contacte", goals: "obiective" };
function workloadText(w: Record<string, number>) {
  const parts = Object.entries(w).filter(([, n]) => Number(n) > 0).map(([k, n]) => `${n} ${workloadLabels[k] ?? k}`);
  return parts.length ? parts.join(", ") : "nimic asignat";
}

/** Realocarea datelor unui utilizator către un coleg din aceeași agenție (același apel ca înainte). */
export function ReassignUserDataSheet({ users, open, onOpenChange, initialFrom = "" }: { users: PlatformUser[]; open: boolean; onOpenChange: (v: boolean) => void; initialFrom?: string }) {
  const queryClient = useQueryClient();
  const reassign = useServerFn(reassignUserData);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState("");
  const source = users.find((u) => u.id === from) ?? null;
  const colleagues = source ? users.filter((u) => u.id !== source.id && u.organization_id && u.organization_id === source.organization_id) : [];
  const run = useMutation({
    mutationFn: (vars: { fromUserId: string; toUserId: string }) => reassign({ data: vars }),
    onSuccess: (result) => { void queryClient.invalidateQueries({ queryKey: ["superadmin", "users"] }); onOpenChange(false); toast.success(`Realocare finalizată: ${workloadText(result)}.`); },
    onError: (e: Error) => toastError(e),
  });
  return (
    <Sheet open={open} onOpenChange={(v) => { if (v) { setFrom(initialFrom); setTo(""); } onOpenChange(v); }}>
      <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto p-6 sm:max-w-md">
        <SheetHeader className="p-0">
          <SheetTitle>Realocă proprietăți și lead-uri</SheetTitle>
          <SheetDescription>Mută tot ce este asignat unui utilizator (proprietăți, lead-uri, activități, cereri, contacte, obiective) către un coleg din aceeași agenție. Nu se șterge nimeni.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>De la</Label>
            <Select value={from || undefined} onValueChange={(v) => { setFrom(v); setTo(""); }}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Alege utilizatorul sursă" /></SelectTrigger>
              <SelectContent>{users.filter((u) => u.organization_id).map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name} · {u.organization_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Către</Label>
            <Select value={to || undefined} onValueChange={setTo} disabled={!from}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Alege utilizatorul destinație" /></SelectTrigger>
              <SelectContent>{colleagues.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}</SelectContent>
            </Select>
            {from && colleagues.length === 0 ? <p className="text-xs text-destructive">Agenția nu are alt membru care să preia datele.</p> : null}
          </div>
        </div>
        <SheetFooter className="mt-auto flex-row justify-end gap-2 p-0">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>Renunță</Button>
          <Button className="h-11" disabled={!from || !to || run.isPending} onClick={() => run.mutate({ fromUserId: from, toUserId: to })}>Realocă</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Toate acțiunile pe un cont: editare, (de)activare, acces temporar, realocare, ștergere. */
export function UserAdminActions({ user, users, organizations }: { user: PlatformUser; users: PlatformUser[]; organizations: { id: string; name: string }[] }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const saveUser = useServerFn(updatePlatformUser);
  const setActive = useServerFn(setPlatformUserActive);
  const fetchMyRequests = useServerFn(listMyImpersonationRequests);
  const myRequests = useQuery({ queryKey: ["impersonation-requests"], queryFn: () => fetchMyRequests({}), refetchInterval: 60_000 });
  const [accessOpen, setAccessOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", job_title: "", role: "agent", organizationId: "none" });
  const isSuper = user.roles.includes("superadmin");
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["superadmin", "users"] });

  const live = (myRequests.data ?? []).find((r) => r.target_user_id === user.id && r.status === "approved" && new Date(r.expires_at).getTime() > Date.now()) ?? null;
  const pending = (myRequests.data ?? []).some((r) => r.target_user_id === user.id && r.status === "pending");
  const enterAccount = async (requestId: string) => { setImpersonationId(requestId); await queryClient.invalidateQueries(); void navigate({ to: "/app" }); };

  const toggleActive = useMutation({
    mutationFn: (vars: { userId: string; isActive: boolean }) => setActive({ data: vars }),
    onSuccess: () => { void invalidate(); toast.success("Statusul contului a fost actualizat."); },
    onError: (e: Error) => toastError(e),
  });
  const save = useMutation({
    mutationFn: () => saveUser({ data: {
      userId: user.id,
      full_name: form.full_name.trim(),
      email: form.email.trim() ? form.email.trim() : null,
      phone: form.phone.trim() ? form.phone.trim() : null,
      job_title: form.job_title.trim() ? form.job_title.trim() : null,
      role: isSuper ? null : (form.role as "agent" | "agency_admin"),
      organizationId: form.organizationId === "none" ? null : form.organizationId,
    } }),
    onSuccess: () => { void invalidate(); setEditing(false); toast.success("Contul a fost actualizat."); },
    onError: (e: Error) => toastError(e),
  });
  const openEdit = () => {
    setForm({ full_name: user.full_name, email: user.email ?? "", phone: user.phone ?? "", job_title: user.job_title ?? "", role: user.roles.includes("agency_admin") ? "agency_admin" : "agent", organizationId: user.organization_id ?? "none" });
    setEditing(true);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" className="h-11" onClick={openEdit}><Pencil className="mr-1.5 size-4" />Editează</Button>
      <Button variant="outline" className="h-11" disabled={toggleActive.isPending} onClick={() => toggleActive.mutate({ userId: user.id, isActive: !user.is_active })}>{user.is_active ? "Dezactivează" : "Reactivează"}</Button>
      {isSuper ? null : live ? (
        <Button className="h-11" onClick={() => void enterAccount(live.id)} title="Accesul a fost aprobat de utilizator"><LogIn className="mr-1.5 size-4" />Intră în cont</Button>
      ) : (
        <Button variant="outline" className="h-11" disabled={pending} onClick={() => setAccessOpen(true)} title={pending ? "Cerere trimisă, în așteptarea acordului utilizatorului" : "Solicită acces temporar la cont"}>
          <KeyRound className="mr-1.5 size-4" />{pending ? "Cerere trimisă" : "Acces temporar"}
        </Button>
      )}
      {user.organization_id ? <Button variant="outline" className="h-11" onClick={() => setReassignOpen(true)}><ArrowRightLeft className="mr-1.5 size-4" />Mută proprietățile</Button> : null}
      <Button variant="ghost" className="h-11 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={isSuper} onClick={() => setDeleting(true)}><Trash2 className="mr-1.5 size-4" />Șterge</Button>

      <ImpersonationRequestDialog open={accessOpen} onOpenChange={setAccessOpen} targetUserId={accessOpen ? user.id : null} targetLabel={user.full_name || user.email || "Utilizatorul"} />
      <ReassignUserDataSheet users={users} open={reassignOpen} onOpenChange={setReassignOpen} initialFrom={user.id} />
      <UserDeletionDialog user={deleting ? user : null} users={users} onClose={() => setDeleting(false)} />

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editează contul</DialogTitle>
            <DialogDescription>Modificările se aplică imediat și se înregistrează în jurnalul de audit.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <UserAvatarEditor key={user.id} userId={user.id} name={user.full_name} initialPath={user.avatar_url} />
            <div className="grid gap-1.5"><Label htmlFor="u-name">Nume complet</Label><Input id="u-name" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} /></div>
            <div className="grid gap-1.5">
              <Label htmlFor="u-email">Email</Label>
              <Input id="u-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              <p className="text-xs text-muted-foreground">Schimbarea emailului actualizează și datele de autentificare.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5"><Label htmlFor="u-phone">Telefon</Label><Input id="u-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
              <div className="grid gap-1.5"><Label htmlFor="u-job">Funcție</Label><Input id="u-job" value={form.job_title} onChange={(e) => setForm((f) => ({ ...f, job_title: e.target.value }))} /></div>
            </div>
            {!isSuper ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Rol</Label>
                  <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="agent">Agent</SelectItem><SelectItem value="agency_admin">Admin agenție</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Agenție</Label>
                  <Select value={form.organizationId} onValueChange={(v) => setForm((f) => ({ ...f, organizationId: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Fără agenție</SelectItem>
                      {organizations.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Mutarea nu duce cu ea datele asignate — realocă-le înainte, în agenția veche.</p>
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>Renunță</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Salvează</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
