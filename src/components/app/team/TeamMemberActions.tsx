import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRightLeft, MoreHorizontal, Pencil, Power, Trash2 } from "lucide-react";

import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { ProfileEditForm } from "@/components/app/ProfileEditForm";
import { ReassignPropertiesDialog } from "@/components/app/ReassignPropertiesDialog";
import { listUserPropertyIds } from "@/lib/property-agent.functions";
import {
  removeAgent,
  setAgentActive,
  type TeamMember,
  type TeamOverview,
} from "@/lib/agency-team.functions";

export const teamQueryKey = ["agency", "team"] as const;

/** Ce poate face managerul asupra unui membru; aceleași reguli ca înainte. */
export function memberPermissions(member: TeamMember, currentUserId: string | undefined) {
  const isAgent = member.roles.includes("agent");
  const isSelf = member.id === currentUserId;
  return {
    canEdit: (isAgent && !member.roles.includes("agency_admin")) || isSelf,
    canToggle: isAgent && !isSelf,
    canRemove: isAgent && !isSelf,
    canMove: true,
  };
}

/** Acțiunile unui membru al echipei, ca meniu (listă) sau ca butoane (pagina agentului). */
export function TeamMemberActions({
  member,
  members,
  currentUserId,
  variant = "menu",
}: {
  member: TeamMember;
  members: TeamMember[];
  currentUserId: string | undefined;
  variant?: "menu" | "buttons";
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toggle = useServerFn(setAgentActive);
  const remove = useServerFn(removeAgent);
  const listIds = useServerFn(listUserPropertyIds);
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const perms = memberPermissions(member, currentUserId);

  const apply = (o: TeamOverview) => queryClient.setQueryData(teamQueryKey, o);

  const toggleMutation = useMutation({
    mutationFn: () => toggle({ data: { userId: member.id, isActive: !member.is_active } }),
    onSuccess: (o) => {
      apply(o);
      toast.success("Statusul agentului a fost actualizat.");
    },
    onError: (e: Error) => toastError(e),
  });

  const removeMutation = useMutation({
    mutationFn: () => remove({ data: { userId: member.id } }),
    onSuccess: (o) => {
      apply(o);
      setRemoving(false);
      toast.success("Agentul a fost eliminat din agenție.");
      if (variant === "buttons") void navigate({ to: "/app/team" });
    },
    onError: (e: Error) => toastError(e),
  });

  const toggleLabel = member.is_active ? "Dezactivează" : "Reactivează";

  return (
    <>
      {variant === "menu" ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-11 sm:size-9" aria-label={`Acțiuni pentru ${member.full_name}`}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {perms.canEdit ? (
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <Pencil className="size-4" /> Editează profilul
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={() => setMoving(true)}>
              <ArrowRightLeft className="size-4" /> Mută toate anunțurile
            </DropdownMenuItem>
            {perms.canToggle ? (
              <DropdownMenuItem disabled={toggleMutation.isPending} onSelect={() => toggleMutation.mutate()}>
                <Power className="size-4" /> {toggleLabel}
              </DropdownMenuItem>
            ) : null}
            {perms.canRemove ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setRemoving(true)}>
                  <Trash2 className="size-4" /> Elimină din agenție
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <div className="flex flex-wrap gap-2">
          {perms.canEdit ? (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> Editează profilul
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => setMoving(true)}>
            <ArrowRightLeft className="size-4" /> Mută anunțurile
          </Button>
          {perms.canToggle ? (
            <Button variant="outline" disabled={toggleMutation.isPending} onClick={() => toggleMutation.mutate()}>
              <Power className="size-4" /> {toggleLabel}
            </Button>
          ) : null}
          {perms.canRemove ? (
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setRemoving(true)}>
              <Trash2 className="size-4" /> Elimină
            </Button>
          ) : null}
        </div>
      )}

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editează profilul</DialogTitle>
            <DialogDescription>
              Numele și telefonul apar pe portaluri la anunțurile agentului. Emailul de autentificare
              îl poate schimba doar utilizatorul.
            </DialogDescription>
          </DialogHeader>
          {editing ? <ProfileEditForm key={member.id} profile={member} onSaved={() => setEditing(false)} /> : null}
        </DialogContent>
      </Dialog>

      {moving ? (
        <ReassignPropertiesDialog
          open
          onOpenChange={(v) => !v && setMoving(false)}
          title={`Mută toate anunțurile lui ${member.full_name}`}
          description="Se mută toate anunțurile nesterse ale utilizatorului, în loturi."
          candidates={members.filter((m) => m.is_active)}
          excludeUserId={member.id}
          loadIds={async () => (await listIds({ data: { userId: member.id } })).ids}
          onDone={() => queryClient.invalidateQueries({ queryKey: ["properties"] })}
        />
      ) : null}

      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title="Elimini agentul din agenție?"
        description={`Contul lui ${member.full_name} va fi șters și locul se eliberează în planul tău.`}
        confirmLabel="Elimină agentul"
        destructive
        onConfirm={() => removeMutation.mutate()}
      />
    </>
  );
}
