import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { notifyProperstarFeedChanged } from "@/lib/portals/properstar-cache";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { AgencyPortalCatalogCard } from "@/components/app/AgencyPortalCatalogCard";
import { AgencyBrandingCard } from "@/components/app/AgencyBrandingCard";
import { AiSettingsCard } from "@/components/app/ai/AiSettingsCard";


import { SiteFeedCard } from "@/components/app/SiteFeedCard";
import { CollaborationAutoSwitch } from "@/components/app/CollaborationAutoSwitch";
import { AgencyCompanyDataFields } from "@/components/app/AgencyCompanyDataFields";
import { FacebookCatalogCard } from "@/components/app/FacebookCatalogCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PortalSlotsCard } from "@/components/app/PortalSlotsCard";
import { ImobiliarePromotionsAdminCard } from "@/components/app/ImobiliarePromotionsAdminCard";

import { ProperstarFeedCard } from "@/components/app/ProperstarFeedCard";

import { AccountAccessCard } from "@/components/app/AccountAccessCard";
import { supabase } from "@/integrations/supabase/client";
import { AGENCY_FIELD_LABELS, validateRequiredAgencyField } from "@/lib/agency-public-data";
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
import { PLAN_LABELS, normalizePlan, planAgentLimitLabel } from "@/lib/plans";
import { getTeamOverview } from "@/lib/agency-team.functions";
import { useServerFn } from "@tanstack/react-start";
import { ProfileEditForm } from "@/components/app/ProfileEditForm";
import { appHead } from "@/components/app/app-head";
import {
  canManageCollaborationDefault,
  parseOptionalCollaborationCommission,
} from "@/lib/collaboration-commission";
import {
  SETTINGS_TABS,
  SETTINGS_TAB_LABELS,
  settingsTabGroups,
  type SettingsTab,
} from "@/lib/settings-tabs";
import { useAgencyLogoUrl } from "@/components/app/AgencyBrandingCard";
import { UserAvatar } from "@/components/app/UserAvatar";
import { Link } from "@tanstack/react-router";
import {
  Building2,
  Bot,
  Megaphone,
  Palette,
  Plug,
  Globe,
  ShieldCheck,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TAB_ICONS: Record<SettingsTab, LucideIcon> = {
  profile: UserRound,
  access: ShieldCheck,
  agency: Building2,
  branding: Palette,
  team: Users,
  portals: Globe,
  promotion: Megaphone,
  integrations: Plug,
  ai: Bot,
};

function SettingsCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-[22px] border border-border/70 bg-card p-5 shadow-soft sm:p-6", className)}>
      <header className="mb-5 space-y-1">
        <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

function SettingsField({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}



export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => appHead("Habitoo CRM — setări"),
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: SettingsTab; request?: string } => {
    const tab = SETTINGS_TABS.find((value) => value === search.tab);
    return {
      ...(tab ? { tab } : {}),
      ...(typeof search.request === "string" ? { request: search.request } : {}),
    };
  },
  component: SettingsPage,
});

function SettingsPage() {
  const { tab = "profile", request } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const tabsListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const activeTab = tabsListRef.current?.querySelector<HTMLElement>('[data-state="active"]');
    activeTab?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [tab]);

  const [profileForm, setProfileForm] = useState({
    full_name: user?.profile?.full_name ?? "",
    phone: user?.profile?.phone ?? "",
    job_title: user?.profile?.job_title ?? "",
  });
  const buildOrgForm = () => ({
    name: user?.organization?.name ?? "",
    city: user?.organization?.city ?? "",
    postal_code: user?.organization?.postal_code ?? "",

    phone: user?.organization?.phone ?? "",
    email: user?.organization?.email ?? "",
    legal_representative: user?.organization?.legal_representative ?? "",
    legal_representative_title: user?.organization?.legal_representative_title ?? "",
    collaboration_enabled: user?.organization?.collaboration_enabled !== false,
    collab_default_commission_percent:
      user?.organization?.collab_default_commission_percent !== null &&
      user?.organization?.collab_default_commission_percent !== undefined
        ? String(user.organization.collab_default_commission_percent)
        : "",
    storia_auto_republish: user?.organization?.storia_auto_republish === true,
    public_partner_enabled: user?.organization?.public_partner_enabled === true,
  });
  const [orgForm, setOrgForm] = useState(buildOrgForm);
  const orgBaseline = buildOrgForm();
  const orgDirty = JSON.stringify(orgForm) !== JSON.stringify(orgBaseline);
  const logoUrl = useAgencyLogoUrl(user?.organization?.logo_path);
  const groups = settingsTabGroups(user);
  const visibleTabs = groups.flatMap((g) => g.tabs);
  const activeTab: SettingsTab = visibleTabs.includes(tab) ? tab : "profile";
  const selectTab = (value: SettingsTab) => {
    void navigate({
      search: (previous) => ({
        ...previous,
        tab: value,
        request: value === "access" ? previous.request : undefined,
      }),
      replace: true,
    });
  };


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
      // Datele agentului apar în feedul Properstar.
      notifyProperstarFeedChanged();
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
      notifyProperstarFeedChanged();
      toast.success("Profilul a fost actualizat.");
    },
    onError: (e: Error) => toastError(e),
  });

  // Locurile ocupate din plan — doar afișare, fără nicio acțiune de schimbare a planului.
  const fetchTeam = useServerFn(getTeamOverview);
  const { data: seats } = useQuery({
    queryKey: ["team-overview", user?.organization?.id ?? "none"],
    queryFn: () => fetchTeam(),
    enabled: Boolean(user?.organization?.id),
  });

  const saveOrg = useMutation({

    mutationFn: async () => {
      if (!user?.organization?.id) throw new Error("Agenția nu este configurată.");
      if (!canManageCollaborationDefault(user.role)) {
        throw new Error("Doar administratorul agenției poate modifica aceste date.");
      }
      for (const f of ["email", "phone", "city", "postal_code"] as const) {
        const msg = validateRequiredAgencyField(f, orgForm[f]);
        if (msg) throw new Error(`${AGENCY_FIELD_LABELS[f]}: ${msg}`);
      }
      const { error } = await supabase
        .from("organizations")
        .update({
          name: orgForm.name,
          city: orgForm.city || null,
          postal_code: orgForm.postal_code || null,

          phone: orgForm.phone || null,
          email: orgForm.email || null,
          legal_representative: orgForm.legal_representative || null,
          legal_representative_title: orgForm.legal_representative_title || null,
          collaboration_enabled: orgForm.collaboration_enabled,
          collab_default_commission_percent: parseOptionalCollaborationCommission(
            orgForm.collab_default_commission_percent,
          ),
          storia_auto_republish: orgForm.storia_auto_republish,
          public_partner_enabled: orgForm.public_partner_enabled,
        })
        .eq("id", user.organization.id);
      if (error) {
        if (error.code === "23505") throw new Error("Adresa paginii publice este deja folosită de altă agenție.");
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
      toast.success("Datele agenției au fost salvate.");
    },
    onError: (e: Error) => toastError(e),
  });

  const teamMembers = seats?.members ?? [];
  const activeCount = teamMembers.filter((m) => m.is_active && !m.invited).length;
  const invitedCount = teamMembers.filter((m) => m.invited).length;
  const latestMembers = [...teamMembers]
    .sort((a, b) => String((b as { created_at?: string }).created_at ?? "").localeCompare(String((a as { created_at?: string }).created_at ?? "")))
    .slice(0, 3);

  return (
    <div data-settings-root className="min-w-0 max-w-full overflow-x-hidden pb-6">
      <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <PageHeader
          title="Setări"
          description="Profilul tău, accesul la cont și, pentru manager, toate datele agenției."
        />
        {user?.organization ? (
          <div className="hidden min-w-0 items-center gap-3 rounded-[20px] border border-border/70 bg-card px-4 py-2 shadow-sm sm:flex">
            {logoUrl ? (
              <img src={logoUrl} alt={`Logo ${user.organization.name}`} className="h-9 w-auto max-w-[120px] shrink-0 object-contain" />
            ) : (
              <Building2 className="size-5 shrink-0 text-gold" aria-hidden />
            )}
            <span className="truncate text-sm font-medium text-foreground">{user.organization.name}</span>
          </div>
        ) : null}
      </div>

      <Tabs
        className="min-w-0 max-w-full lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start lg:gap-8"
        value={activeTab}
        onValueChange={(value) => selectTab(value as SettingsTab)}
        orientation="vertical"
      >
        {/* Desktop: meniu vertical grupat */}
        <nav aria-label="Secțiuni setări" className="sticky top-4 hidden space-y-6 rounded-[22px] border border-border/70 bg-card p-3 shadow-sm lg:block">
          {groups.map((group) => (
            <div key={group.title} className="space-y-1">
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.title}
              </p>
              {group.tabs.map((value) => {
                const Icon = TAB_ICONS[value];
                const active = value === activeTab;
                return (
                  <button
                    key={value}
                    type="button"
                    data-settings-nav={value}
                    aria-current={active ? "page" : undefined}
                    onClick={() => selectTab(value)}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "bg-gold/15 text-foreground ring-1 ring-gold/40"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", active ? "text-gold" : "")} aria-hidden />
                    {SETTINGS_TAB_LABELS[value]}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Telefon/tabletă: rând de file derulabil, lipit sus */}
        <div className="sticky top-0 z-20 -mx-4 mb-5 bg-background/95 py-2 backdrop-blur lg:hidden">
          <div className="relative min-w-0 max-w-full overflow-hidden after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-6 after:bg-gradient-to-l after:from-background after:to-transparent before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:z-10 before:w-6 before:bg-gradient-to-r before:from-background before:to-transparent">
            <TabsList
              ref={tabsListRef}
              data-settings-tabs
              className="scrollbar-hidden flex h-auto w-full min-w-0 justify-start gap-1 overflow-x-auto overflow-y-hidden bg-transparent px-4 sm:px-1"
            >
              {visibleTabs.map((value) => {
                const Icon = TAB_ICONS[value];
                return (
                  <TabsTrigger
                    key={value}
                    className="min-h-11 shrink-0 gap-2 rounded-full border border-border/70 bg-card px-4 data-[state=active]:border-gold/50 data-[state=active]:bg-gold/15"
                    value={value}
                  >
                    <Icon className="size-4" aria-hidden />
                    {SETTINGS_TAB_LABELS[value]}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>
        </div>

        <div className="min-w-0 max-w-4xl">
          <TabsContent value="profile" className="mt-0">
            <SettingsCard title="Profilul tău" description="Fotografia, numele și datele de contact afișate clienților.">
              {user ? (
                <ProfileEditForm
                  profile={{
                    id: user.userId,
                    full_name: user.profile?.full_name ?? null,
                    phone: user.profile?.phone ?? null,
                    job_title: user.profile?.job_title ?? null,
                    avatar_url: user.profile?.avatar_url ?? null,
                    email: user.email ?? null,
                  }}
                />
              ) : null}
            </SettingsCard>
          </TabsContent>

          <TabsContent value="access" className="mt-0">
            <div className="rounded-[22px] border border-border/70 bg-card p-1 shadow-sm sm:p-2">
              <AccountAccessCard highlightedRequestId={request} />
            </div>
          </TabsContent>

          {user?.role === "agency_admin" ? (
            <TabsContent value="agency" className="mt-0">
              <form
                className="space-y-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveOrg.mutate();
                }}
              >
                <SettingsCard title="Date firmă" description="Datele oficiale ale firmei și reprezentantul legal.">
                  <div className="space-y-5">
                    <AgencyCompanyDataFields
                      org={user?.organization ?? null}
                      canEdit={user?.role === "agency_admin"}
                    />
                    <div className="grid gap-5 md:grid-cols-2">
                      <SettingsField id="name" label="Numele agenției">
                        <Input id="name" className="h-11" value={orgForm.name} disabled={!user?.isAdmin}
                          onChange={(e) => setOrgForm((f) => ({ ...f, name: e.target.value }))} />
                      </SettingsField>
                      <SettingsField id="legal_representative" label="Reprezentant legal">
                        <Input id="legal_representative" className="h-11" value={orgForm.legal_representative} disabled={!user?.isAdmin}
                          onChange={(e) => setOrgForm((f) => ({ ...f, legal_representative: e.target.value }))} />
                      </SettingsField>
                      <SettingsField id="legal_representative_title" label="Funcția reprezentantului">
                        <Input id="legal_representative_title" className="h-11" value={orgForm.legal_representative_title} disabled={!user?.isAdmin}
                          onChange={(e) => setOrgForm((f) => ({ ...f, legal_representative_title: e.target.value }))} />
                      </SettingsField>
                    </div>
                  </div>
                </SettingsCard>

                <SettingsCard title="Contact și adresă" description="Folosite pe portaluri și în documentele agenției.">
                  <div className="grid gap-5 md:grid-cols-2">
                    <SettingsField id="org_phone" label="Telefon *">
                      <Input id="org_phone" className="h-11" value={orgForm.phone} disabled={!user?.isAdmin}
                        onChange={(e) => setOrgForm((f) => ({ ...f, phone: e.target.value }))} />
                    </SettingsField>
                    <SettingsField id="org_email" label="Email *">
                      <Input id="org_email" className="h-11" value={orgForm.email} disabled={!user?.isAdmin}
                        onChange={(e) => setOrgForm((f) => ({ ...f, email: e.target.value }))} />
                    </SettingsField>
                    <SettingsField id="city" label="Oraș *">
                      <Input id="city" className="h-11" value={orgForm.city} disabled={!user?.isAdmin}
                        onChange={(e) => setOrgForm((f) => ({ ...f, city: e.target.value }))} />
                    </SettingsField>
                    <SettingsField id="org_postal_code" label="Cod poștal *">
                      <Input id="org_postal_code" className="h-11" value={orgForm.postal_code} disabled={!user?.isAdmin} placeholder="ex. 300001"
                        onChange={(e) => setOrgForm((f) => ({ ...f, postal_code: e.target.value }))} />
                    </SettingsField>
                  </div>
                </SettingsCard>

                <SettingsCard title="Informații publice" description="Colaborarea cu alte agenții, republicarea și planul curent.">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4 rounded-2xl border border-border p-4">
                      <div className="min-w-0 space-y-1">
                        <Label htmlFor="collab_enabled" className="text-sm">
                          Participă la Colaborare Habitoo
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Când este activ, proprietățile tale marcate „Disponibilă pentru colaborare” sunt
                          vizibile celorlalte agenții Habitoo, iar tu vezi ofertele lor. Dezactivarea te
                          scoate complet din rețea, în ambele sensuri.
                        </p>
                      </div>
                      <Switch
                        id="collab_enabled"
                        checked={orgForm.collaboration_enabled}
                        onCheckedChange={(v) => setOrgForm((f) => ({ ...f, collaboration_enabled: v }))}
                      />
                    </div>
                    {orgForm.collaboration_enabled ? (
                      <div className="md:max-w-sm">
                        <SettingsField
                          id="collab_default_commission_percent"
                          label="Comision standard pentru colaborare (%)"
                          hint="Se aplică ofertelor bifate pentru colaborare fără comision propriu."
                        >
                          <Input
                            id="collab_default_commission_percent"
                            className="h-11"
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={100}
                            step="any"
                            value={orgForm.collab_default_commission_percent}
                            disabled={user?.role !== "agency_admin"}
                            onChange={(e) =>
                              setOrgForm((form) => ({
                                ...form,
                                collab_default_commission_percent: e.target.value,
                              }))
                            }
                          />
                        </SettingsField>
                      </div>
                    ) : null}
                    {user?.role === "agency_admin" && user?.organization?.collaboration_enabled !== false ? (
                      <CollaborationAutoSwitch
                        initial={user.organization?.collaboration_auto_enabled !== false}
                      />
                    ) : null}
                    <div className="flex items-start justify-between gap-4 rounded-2xl border border-border p-4">
                      <div className="min-w-0 space-y-1">
                        <Label htmlFor="storia_auto_republish" className="text-sm">
                          Republică automat anunțurile expirate pe Storia
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Când un anunț expiră pe Storia, îl retrimitem automat, dacă oferta este încă
                          activă și publicabilă. Dezactivat, primești doar notificarea de expirare și
                          republici manual din fila Publicare.
                        </p>
                      </div>
                      <Switch
                        id="storia_auto_republish"
                        disabled={!user?.isAdmin}
                        checked={orgForm.storia_auto_republish}
                        onCheckedChange={(v) => setOrgForm((f) => ({ ...f, storia_auto_republish: v }))}
                      />
                    </div>
                    {/* Planul este doar informativ: se schimbă exclusiv din Superadmin. */}
                    <div className="space-y-2 rounded-2xl border border-border bg-muted/40 p-4 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-muted-foreground">Plan curent</span>
                        <StatusBadge tone="primary">
                          {PLAN_LABELS[normalizePlan(user?.organization?.plan ?? "basic")]} ·{" "}
                          {planAgentLimitLabel(normalizePlan(user?.organization?.plan ?? "basic"))}
                        </StatusBadge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {seats
                          ? seats.seatLimit === null
                            ? `${seats.seatsUsed} agenți activi · fără limită de locuri`
                            : `${seats.seatsUsed} din ${seats.seatLimit} agenți activi`
                          : "Se încarcă locurile ocupate…"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Planul nu poate fi schimbat din aplicație. Pentru alt plan, scrie-ne la
                        contact@habitoo.ro sau deschide un tichet de suport.
                      </p>
                    </div>

                    <div className="space-y-3 rounded-2xl border border-gold/30 p-4">
                      <h3 className="font-display text-base font-semibold text-foreground">Agenție parteneră Habitoo</h3>
                      {user?.organization?.public_hidden_by_admin ? (
                        <p className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
                          Agenția a fost ascunsă din lista publică de echipa Habitoo. Scrie-ne pentru detalii.
                        </p>
                      ) : null}
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 space-y-1">
                          <Label htmlFor="public_partner_enabled" className="text-sm">
                            Afișează agenția în lista publică de agenții partenere
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Se vor afișa doar numele și logo-ul agenției. Nu se afișează date de contact și nici agenții.
                          </p>
                        </div>
                        <Switch
                          id="public_partner_enabled"
                          disabled={!user?.isAdmin}
                          checked={orgForm.public_partner_enabled}
                          onCheckedChange={(v) => setOrgForm((f) => ({ ...f, public_partner_enabled: v }))}
                        />
                      </div>
                    </div>
                  </div>
                </SettingsCard>

                {user?.isAdmin ? (
                  <div
                    data-settings-savebar
                    className="sticky bottom-3 z-10 flex flex-col gap-2 rounded-[20px] border border-border/70 bg-card/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between"
                  >
                    <p className="px-1 text-sm text-muted-foreground" aria-live="polite">
                      {saveOrg.isPending
                        ? "Se salvează…"
                        : orgDirty
                          ? "Ai modificări nesalvate."
                          : saveOrg.isSuccess
                            ? "Toate modificările sunt salvate."
                            : "Nicio modificare."}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 flex-1 sm:flex-none"
                        disabled={!orgDirty || saveOrg.isPending}
                        onClick={() => setOrgForm(buildOrgForm())}
                      >
                        Renunță
                      </Button>
                      <Button
                        type="submit"
                        className="h-11 flex-1 bg-gold text-gold-foreground hover:bg-gold/90 sm:flex-none"
                        disabled={!orgDirty || saveOrg.isPending}
                      >
                        Salvează modificările
                      </Button>
                    </div>
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
            <TabsContent value="branding" className="mt-0">
              <AgencyBrandingCard />
            </TabsContent>
          ) : null}

          {user?.isAdmin ? (
            <TabsContent value="team" className="mt-0">
              <SettingsCard title="Echipa ta" description="Lista completă, invitațiile și acțiunile sunt pe pagina Agenți.">
                <div className="grid grid-cols-2 gap-3 sm:max-w-md">
                  <div className="rounded-2xl border border-border bg-muted/40 p-4">
                    <p className="text-2xl font-semibold text-foreground">{seats ? activeCount : "—"}</p>
                    <p className="text-xs text-muted-foreground">agenți activi</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-muted/40 p-4">
                    <p className="text-2xl font-semibold text-foreground">{seats ? invitedCount : "—"}</p>
                    <p className="text-xs text-muted-foreground">invitați</p>
                  </div>
                </div>
                {latestMembers.length ? (
                  <ul className="mt-5 divide-y divide-border rounded-2xl border border-border">
                    {latestMembers.map((m) => (
                      <li key={m.id} className="flex min-w-0 items-center gap-3 p-3">
                        <UserAvatar name={m.full_name} path={m.avatar_url} className="size-10 shrink-0" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{m.full_name}</p>
                          <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <Button asChild className="mt-5 h-11 bg-gold text-gold-foreground hover:bg-gold/90">
                  <Link to="/app/team">Gestionează echipa</Link>
                </Button>
              </SettingsCard>
            </TabsContent>
          ) : null}

          {user?.isAdmin ? (
            <TabsContent value="portals" className="mt-0">
              <div className="space-y-6">
                <AgencyPortalCatalogCard />
                <PortalSlotsCard />
                <ImobiliarePromotionsAdminCard />
                <ProperstarFeedCard />
              </div>
            </TabsContent>
          ) : null}

          {user?.isAdmin ? (
            <TabsContent value="promotion" className="mt-0">
              <div className="space-y-6">
                <FacebookCatalogCard />
              </div>
            </TabsContent>
          ) : null}

          {user?.isAdmin ? (
            <TabsContent value="integrations" className="mt-0">
              <div className="space-y-6">
                <SiteFeedCard />
              </div>
            </TabsContent>
          ) : null}

          {user?.isAdmin ? (
            <TabsContent value="ai" className="mt-0">
              <AiSettingsCard />
            </TabsContent>
          ) : null}
        </div>
      </Tabs>
    </div>
  );
}
