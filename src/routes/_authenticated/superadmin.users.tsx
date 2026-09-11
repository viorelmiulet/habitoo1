import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowRightLeft, Pencil, Search, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/errors";
import { PageHeader } from "@/components/app/PageHeader";
import { ListSkeleton } from "@/components/app/LoadingState";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { UserAvatar } from "@/components/app/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { formatDate } from "@/lib/format";
import { roleLabels } from "@/lib/labels";
import {
  deletePlatformUser,
  getUserWorkload,
  listPlatformUsers,
  reassignUserData,
  setPlatformUserActive,
  updatePlatformUser,
  type PlatformUser,
} from "@/lib/superadmin-users.functions";

export const Route = createFileRoute("/_authenticated/superadmin/users")({
  component: UsersPage,
});

const workloadLabels: Record<string, string> = {
  properties: "proprietăți",
  leads: "lead-uri",
  activities: "activități",
  requests: "cereri",
  contacts: "contacte",
  goals: "obiective",
};

function workloadText(w: Record<string, number>) {
  const parts = Object.entries(w)
    .filter(([, n]) => Number(n) > 0)
    .map(([k, n]) => `${n} ${workloadLabels[k] ?? k}`);
  return parts.length ? parts.join(", ") : "nimic asignat";
}

function UsersPage() {
  const queryClient = useQueryClient();
  const fetchUsers = useServerFn(listPlatformUsers);
  const fetchWorkload = useServerFn(getUserWorkload);
  const saveUser = useServerFn(updatePlatformUser);
  const setActive = useServerFn(setPlatformUserActive);
  const reassign = useServerFn(reassignUserData);
  const removeUser = useServerFn(deletePlatformUser);

  const [q, setQ] = useState("");
  const [orgFilter, setOrgFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [editing, setEditing] = useState<PlatformUser | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    job_title: "",
    role: "agent",
    organizationId: "none",
  });

  const [deleting, setDeleting] = useState<PlatformUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState("none");
  const [confirmName, setConfirmName] = useState("");
  const [workload, setWorkload] = useState<Record<string, number> | null>(null);

  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignFrom, setReassignFrom] = useState("");
  const [reassignTo, setReassignTo] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["superadmin", "users"],
    queryFn: () => fetchUsers(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["superadmin", "users"] });

  const toggleActive = useMutation({
    mutationFn: (vars: { userId: string; isActive: boolean }) => setActive({ data: vars }),
    onSuccess: () => {
      invalidate();
      toast.success("Statusul contului a fost actualizat.");
    },
    onError: (e: Error) => toastError(e),
  });

  const save = useMutation({
    mutationFn: () =>
      saveUser({
        data: {
          userId: editing!.id,
          full_name: form.full_name.trim(),
          email: form.email.trim() ? form.email.trim() : null,
          phone: form.phone.trim() ? form.phone.trim() : null,
          job_title: form.job_title.trim() ? form.job_title.trim() : null,
          role: editing!.roles.includes("superadmin")
            ? null
            : (form.role as "agent" | "agency_admin"),
          organizationId: form.organizationId === "none" ? null : form.organizationId,
        },
      }),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success("Contul a fost actualizat.");
    },
    onError: (e: Error) => toastError(e),
  });

  const doReassign = useMutation({
    mutationFn: (vars: { fromUserId: string; toUserId: string }) => reassign({ data: vars }),
    onSuccess: (result) => {
      invalidate();
      setReassignOpen(false);
      toast.success(`Realocare finalizată: ${workloadText(result)}.`);
    },
    onError: (e: Error) => toastError(e),
  });

  const doDelete = useMutation({
    mutationFn: () =>
      removeUser({
        data: {
          userId: deleting!.id,
          reassignToUserId: deleteTarget === "none" ? null : deleteTarget,
          confirmName: confirmName.trim(),
        },
      }),
    onSuccess: (result) => {
      invalidate();
      setDeleting(null);
      toast.success(
        result.authError
          ? `Contul a fost șters, dar autentificarea a raportat: ${result.authError}`
          : "Contul a fost șters definitiv.",
      );
    },
    onError: (e: Error) => toastError(e),
  });

  const users = data?.users ?? [];
  const orgs = data?.organizations ?? [];

  const rows = useMemo(
    () =>
      users.filter((u) => {
        const text = `${u.full_name} ${u.email ?? ""}`.toLowerCase();
        if (q.trim() && !text.includes(q.trim().toLowerCase())) return false;
        if (orgFilter !== "all") {
          if (orgFilter === "none" ? u.organization_id !== null : u.organization_id !== orgFilter)
            return false;
        }
        if (roleFilter !== "all" && !u.roles.includes(roleFilter)) return false;
        if (statusFilter === "active" && !u.is_active) return false;
        if (statusFilter === "inactive" && u.is_active) return false;
        return true;
      }),
    [users, q, orgFilter, roleFilter, statusFilter],
  );

  const colleagues = (user: PlatformUser | null) =>
    user
      ? users.filter(
          (u) => u.id !== user.id && u.organization_id && u.organization_id === user.organization_id,
        )
      : [];

  const openEdit = (u: PlatformUser) => {
    setEditing(u);
    setForm({
      full_name: u.full_name,
      email: u.email ?? "",
      phone: u.phone ?? "",
      job_title: u.job_title ?? "",
      role: u.roles.includes("agency_admin") ? "agency_admin" : "agent",
      organizationId: u.organization_id ?? "none",
    });
  };

  const openDelete = async (u: PlatformUser) => {
    setDeleting(u);
    setDeleteTarget("none");
    setConfirmName("");
    setWorkload(null);
    try {
      setWorkload(await fetchWorkload({ data: { userId: u.id } }));
    } catch (e) {
      toastError(e as Error);
    }
  };

  const reassignSource = users.find((u) => u.id === reassignFrom) ?? null;
  const pendingWork = workload
    ? Object.values(workload).reduce((s, n) => s + Number(n || 0), 0)
    : 0;

  return (
    <>
      <PageHeader
        title="Utilizatori"
        description="Toate conturile platformei: editare, activare, realocare și ștergere definitivă."
        actions={
          <Button
            variant="outline"
            onClick={() => {
              setReassignFrom("");
              setReassignTo("");
              setReassignOpen(true);
            }}
          >
            <ArrowRightLeft className="mr-2 size-4" />
            Realocă date
          </Button>
        }
      />

      <div className="panel grid gap-3 p-4 md:grid-cols-4">
        <div className="relative md:col-span-2">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Caută nume sau email…"
            className="pl-9"
          />
        </div>
        <Select value={orgFilter} onValueChange={setOrgFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Agenție" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate agențiile</SelectItem>
            <SelectItem value="none">Fără agenție</SelectItem>
            {orgs.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Rol" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate rolurile</SelectItem>
              <SelectItem value="agency_admin">Admin agenție</SelectItem>
              <SelectItem value="agent">Agent</SelectItem>
              <SelectItem value="superadmin">Superadmin</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Dezactivate</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Filtrele active, ca pastile care se pot închide */}
      {q.trim() || orgFilter !== "all" || roleFilter !== "all" || statusFilter !== "all" ? (
        <div className="flex flex-wrap items-center gap-2">
          {q.trim() ? (
            <FilterPill label={`Căutare: ${q.trim()}`} onClear={() => setQ("")} />
          ) : null}
          {orgFilter !== "all" ? (
            <FilterPill
              label={
                orgFilter === "none"
                  ? "Fără agenție"
                  : (orgs.find((o) => o.id === orgFilter)?.name ?? "Agenție")
              }
              onClear={() => setOrgFilter("all")}
            />
          ) : null}
          {roleFilter !== "all" ? (
            <FilterPill
              label={roleLabels[roleFilter] ?? roleFilter}
              onClear={() => setRoleFilter("all")}
            />
          ) : null}
          {statusFilter !== "all" ? (
            <FilterPill
              label={statusFilter === "active" ? "Active" : "Dezactivate"}
              onClear={() => setStatusFilter("all")}
            />
          ) : null}
          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline"
            onClick={() => {
              setQ("");
              setOrgFilter("all");
              setRoleFilter("all");
              setStatusFilter("all");
            }}
          >
            Șterge filtrele
          </button>
        </div>
      ) : null}


      <div className="panel overflow-hidden">
        {isLoading ? (
          <ListSkeleton rows={8} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Users} title="Niciun utilizator găsit" />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <UserAvatar name={u.full_name} path={u.avatar_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{u.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.email ?? "—"}</p>
                </div>
                <span className="w-40 truncate text-xs text-muted-foreground">
                  {u.organization_name ?? "Fără agenție"}
                </span>
                {u.roles.map((r) => (
                  <StatusBadge key={r} tone="primary">
                    {roleLabels[r] ?? r}
                  </StatusBadge>
                ))}
                <StatusBadge tone={u.is_active ? "success" : "neutral"}>
                  {u.is_active ? "Activ" : "Dezactivat"}
                </StatusBadge>
                <span className="w-24 text-right text-xs text-muted-foreground">
                  {formatDate(u.created_at)}
                </span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(u)}>
                    <Pencil className="size-4" />
                    <span className="sr-only">Editează</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={toggleActive.isPending}
                    onClick={() =>
                      toggleActive.mutate({ userId: u.id, isActive: !u.is_active })
                    }
                  >
                    {u.is_active ? "Dezactivează" : "Reactivează"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    disabled={u.roles.includes("superadmin")}
                    onClick={() => void openDelete(u)}
                  >
                    <Trash2 className="size-4" />
                    <span className="sr-only">Șterge</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Editare cont */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editează contul</DialogTitle>
            <DialogDescription>
              Modificările se aplică imediat și se înregistrează în jurnalul de audit.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="u-name">Nume complet</Label>
              <Input
                id="u-name"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="u-email">Email</Label>
              <Input
                id="u-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Schimbarea emailului actualizează și datele de autentificare.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="u-phone">Telefon</Label>
                <Input
                  id="u-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="u-job">Funcție</Label>
                <Input
                  id="u-job"
                  value={form.job_title}
                  onChange={(e) => setForm((f) => ({ ...f, job_title: e.target.value }))}
                />
              </div>
            </div>
            {editing && !editing.roles.includes("superadmin") ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Rol</Label>
                  <Select
                    value={form.role}
                    onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agent">Agent</SelectItem>
                      <SelectItem value="agency_admin">Admin agenție</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Agenție</Label>
                  <Select
                    value={form.organizationId}
                    onValueChange={(v) => setForm((f) => ({ ...f, organizationId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Fără agenție</SelectItem>
                      {orgs.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Mutarea nu duce cu ea datele asignate — realocă-le înainte, în agenția veche.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Renunță
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Salvează
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Realocare independentă */}
      <Sheet open={reassignOpen} onOpenChange={setReassignOpen}>
        <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto p-6 sm:max-w-md">
          <SheetHeader className="p-0">
            <SheetTitle>Realocă proprietăți și lead-uri</SheetTitle>
            <SheetDescription>
              Mută tot ce este asignat unui utilizator (proprietăți, lead-uri, activități, cereri,
              contacte, obiective) către un coleg din aceeași agenție. Nu se șterge nimeni.
            </SheetDescription>
          </SheetHeader>

          <DialogHeader>
            <DialogTitle>Realocă proprietăți și lead-uri</DialogTitle>
            <DialogDescription>
              Mută tot ce este asignat unui utilizator (proprietăți, lead-uri, activități, cereri,
              contacte, obiective) către un coleg din aceeași agenție. Nu se șterge nimeni.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>De la</Label>
              <Select
                value={reassignFrom || undefined}
                onValueChange={(v) => {
                  setReassignFrom(v);
                  setReassignTo("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Alege utilizatorul sursă" />
                </SelectTrigger>
                <SelectContent>
                  {users
                    .filter((u) => u.organization_id)
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name} · {u.organization_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Către</Label>
              <Select value={reassignTo || undefined} onValueChange={setReassignTo} disabled={!reassignFrom}>
                <SelectTrigger>
                  <SelectValue placeholder="Alege utilizatorul destinație" />
                </SelectTrigger>
                <SelectContent>
                  {colleagues(reassignSource).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {reassignFrom && colleagues(reassignSource).length === 0 ? (
                <p className="text-xs text-destructive">
                  Agenția nu are alt membru care să preia datele.
                </p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignOpen(false)}>
              Renunță
            </Button>
            <Button
              disabled={!reassignFrom || !reassignTo || doReassign.isPending}
              onClick={() =>
                doReassign.mutate({ fromUserId: reassignFrom, toUserId: reassignTo })
              }
            >
              Realocă
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ștergere definitivă */}
      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Șterge definitiv contul</DialogTitle>
            <DialogDescription>
              Se șterg profilul, rolurile și contul de autentificare. Acțiunea nu poate fi anulată.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <p className="text-sm">
              Date asignate: <strong>{workload ? workloadText(workload) : "se verifică…"}</strong>
            </p>
            {pendingWork > 0 ? (
              <div className="grid gap-1.5">
                <Label>Realocă toate către</Label>
                <Select value={deleteTarget} onValueChange={setDeleteTarget}>
                  <SelectTrigger>
                    <SelectValue placeholder="Alege un coleg" />
                  </SelectTrigger>
                  <SelectContent>
                    {colleagues(deleting).map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {colleagues(deleting).length === 0 ? (
                  <p className="text-xs text-destructive">
                    Nu există alt membru în agenție — ștergerea nu este posibilă fără realocare.
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <Label htmlFor="u-confirm">
                Scrie numele contului pentru confirmare: {deleting?.full_name}
              </Label>
              <Input
                id="u-confirm"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Renunță
            </Button>
            <Button
              variant="destructive"
              disabled={
                doDelete.isPending ||
                workload === null ||
                confirmName.trim() !== (deleting?.full_name ?? "").trim() ||
                (pendingWork > 0 && deleteTarget === "none")
              }
              onClick={() => doDelete.mutate()}
            >
              Șterge definitiv
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
