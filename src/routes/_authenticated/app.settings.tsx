import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { toastError } from "@/lib/errors";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { SiteFeedCard } from "@/components/app/SiteFeedCard";
import { PortalsCard } from "@/components/app/PortalsCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
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
          <TabsTrigger value="agency">Agenție</TabsTrigger>
          <TabsTrigger value="team">Echipă ({team.length})</TabsTrigger>
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

        <TabsContent value="team">
          <div className="panel overflow-hidden">
            <ul className="divide-y divide-border">
              {team.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
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
            Invitarea de agenți noi și permisiunile avansate ajung în faza următoare.
          </p>
        </TabsContent>

        {user?.isAdmin ? (
          <TabsContent value="integrations">
            <div className="space-y-6">
              <SiteFeedCard />
              <PortalsCard />
            </div>
          </TabsContent>
        ) : null}
      </Tabs>

    </>
  );
}
