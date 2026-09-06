import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { toastError } from "@/lib/errors";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { SiteFeedCard } from "@/components/app/SiteFeedCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/app/UserAvatar";
import {
  AVATAR_BUCKET,
  AVATAR_MAX_BYTES,
  AVATAR_TYPES,
  avatarPath,
  compressImage,
  removeFromBucket,
  uploadToBucket,
} from "@/lib/storage";
import { currentUserQueryKey, useCurrentUser } from "@/hooks/use-session";
import { formatDate } from "@/lib/format";
import { roleLabels } from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();

  const [profileForm, setProfileForm] = useState({
    full_name: user?.profile?.full_name ?? "",
    phone: user?.profile?.phone ?? "",
    job_title: user?.profile?.job_title ?? "",
  });
  const [orgForm, setOrgForm] = useState({
    name: user?.organization?.name ?? "",
    city: user?.organization?.city ?? "",
    phone: user?.organization?.phone ?? "",
    email: user?.organization?.email ?? "",
  });

  const { data: team = [] } = useQuery({
    queryKey: ["team"],
    queryFn: async () => {
      const [profiles, roles] = await Promise.all([
        supabase.from("profiles").select("*"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      return (profiles.data ?? []).map((p) => ({
        ...p,
        roles: (roles.data ?? []).filter((r) => r.user_id === p.id).map((r) => r.role),
      }));
    },
  });

  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => {
      if (!user?.userId) throw new Error("Sesiune expirată.");
      if (!user.organization?.id) throw new Error("Agenția nu este configurată.");
      if (!AVATAR_TYPES.includes(file.type)) {
        throw new Error("Folosește o imagine JPG, PNG sau WebP.");
      }
      if (file.size > AVATAR_MAX_BYTES) {
        throw new Error("Imaginea depășește 5 MB.");
      }
      const { blob } = await compressImage(file, 512, 0.85);
      const path = avatarPath(user.organization.id, user.userId);
      await uploadToBucket(AVATAR_BUCKET, path, blob, "image/jpeg");
      const previous = user.profile?.avatar_url ?? null;
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: path })
        .eq("id", user.userId);
      if (error) throw error;
      if (previous && previous !== path) await removeFromBucket(AVATAR_BUCKET, [previous]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
      queryClient.invalidateQueries({ queryKey: ["team"] });
      toast.success("Fotografia de profil a fost actualizată.");
    },
    onError: (e: Error) => toastError(e),
  });

  const saveProfile = useMutation({

    mutationFn: async () => {
      if (!user) throw new Error("Sesiune expirată.");
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: profileForm.full_name,
          phone: profileForm.phone || null,
          job_title: profileForm.job_title || null,
        })
        .eq("id", user.userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
      toast.success("Profilul a fost actualizat.");
    },
    onError: (e: Error) => toastError(e),
  });

  const saveOrg = useMutation({
    mutationFn: async () => {
      if (!user?.organization?.id) throw new Error("Agenția nu este configurată.");
      const { error } = await supabase
        .from("organizations")
        .update({
          name: orgForm.name,
          city: orgForm.city || null,
          phone: orgForm.phone || null,
          email: orgForm.email || null,
        })
        .eq("id", user.organization.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
      toast.success("Datele agenției au fost salvate.");
    },
    onError: (e: Error) => toastError(e),
  });

  return (
    <>
      <PageHeader
        title="Setări"
        description="Profilul tău, datele agenției și echipa care are acces la CRM."
      />

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profil</TabsTrigger>
          {user?.isAdmin ? <TabsTrigger value="agency">Agenție</TabsTrigger> : null}
          {user?.isAdmin ? <TabsTrigger value="team">Echipă ({team.length})</TabsTrigger> : null}
          {user?.isAdmin ? <TabsTrigger value="integrations">Integrări</TabsTrigger> : null}
        </TabsList>


        <TabsContent value="profile">
          <form
            className="panel max-w-xl space-y-4 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              saveProfile.mutate();
            }}
          >
            <div className="flex items-center gap-4">
              <UserAvatar
                name={user?.profile?.full_name ?? user?.email}
                path={user?.profile?.avatar_url}
                className="size-16 text-base"
              />
              <div className="space-y-1">
                <Label htmlFor="avatar">Fotografie de profil</Label>
                <Input
                  id="avatar"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploadAvatar.isPending}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) uploadAvatar.mutate(file);
                  }}
                />
                <p className="text-xs text-muted-foreground">JPG, PNG sau WebP, maximum 5 MB.</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="full_name">Nume complet</Label>
              <Input
                id="full_name"
                value={profileForm.full_name}
                onChange={(e) => setProfileForm((f) => ({ ...f, full_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefon</Label>
              <Input
                id="phone"
                value={profileForm.phone}
                onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="job_title">Funcție</Label>
              <Input
                id="job_title"
                value={profileForm.job_title}
                onChange={(e) => setProfileForm((f) => ({ ...f, job_title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email ?? ""} disabled />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={saveProfile.isPending}>
                Salvează profilul
              </Button>
            </div>
          </form>
        </TabsContent>

        {user?.isAdmin ? (
        <TabsContent value="agency">
          <form
            className="panel max-w-xl space-y-4 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              saveOrg.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="name">Numele agenției</Label>
              <Input
                id="name"
                value={orgForm.name}
                disabled={!user?.isAdmin}
                onChange={(e) => setOrgForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">Oraș</Label>
              <Input
                id="city"
                value={orgForm.city}
                disabled={!user?.isAdmin}
                onChange={(e) => setOrgForm((f) => ({ ...f, city: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org_phone">Telefon</Label>
              <Input
                id="org_phone"
                value={orgForm.phone}
                disabled={!user?.isAdmin}
                onChange={(e) => setOrgForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org_email">Email</Label>
              <Input
                id="org_email"
                value={orgForm.email}
                disabled={!user?.isAdmin}
                onChange={(e) => setOrgForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-4 text-sm">
              <span className="text-muted-foreground">Plan curent</span>
              <StatusBadge tone="primary">{user?.organization?.plan ?? "—"}</StatusBadge>
            </div>
            {user?.isAdmin ? (
              <div className="flex justify-end">
                <Button type="submit" disabled={saveOrg.isPending}>
                  Salvează agenția
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Doar administratorul agenției poate modifica aceste date.
              </p>
            )}
          </form>
        </TabsContent>
        ) : null}

        {user?.isAdmin ? (
        <TabsContent value="team">
          <div className="panel overflow-hidden">
            <ul className="divide-y divide-border">
              {team.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <UserAvatar name={m.full_name} path={m.avatar_url} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.email ?? "—"}</p>
                  </div>
                  {m.roles.map((r) => (
                    <StatusBadge key={r} tone="primary">
                      {roleLabels[r] ?? r}
                    </StatusBadge>
                  ))}
                  <StatusBadge tone={m.is_active ? "success" : "neutral"}>
                    {m.is_active ? "Activ" : "Inactiv"}
                  </StatusBadge>
                  <span className="text-xs text-muted-foreground">{formatDate(m.created_at)}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Invitarea de agenți noi și locurile disponibile în plan se gestionează din pagina{" "}
            <Link to="/app/team" className="underline">
              Agenți
            </Link>
            .
          </p>
        </TabsContent>
        ) : null}

        {user?.isAdmin ? (
          <TabsContent value="integrations">
            <div className="space-y-6">
              <SiteFeedCard />
            </div>
          </TabsContent>
        ) : null}
      </Tabs>

    </>
  );
}
