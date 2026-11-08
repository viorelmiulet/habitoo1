import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Globe } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/app/StatusBadge";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { SiteFeedCard } from "@/components/app/SiteFeedCard";
import { toastError } from "@/lib/errors";
import { getAgencySiteSettings, saveAgencySiteSettings } from "@/lib/agency-site.functions";
import { normalizeAgencySiteUrl } from "@/lib/site-feed/agency-site";

const key = ["agency-site-settings"] as const;

/** Setări → Portaluri → „Site-ul agenției” (doar administratorul agenției). */
export function AgencySitePortalCard() {
  const queryClient = useQueryClient();
  const load = useServerFn(getAgencySiteSettings);
  const save = useServerFn(saveAgencySiteSettings);
  const settings = useQuery({ queryKey: key, queryFn: () => load() });
  const [siteUrl, setSiteUrl] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [active, setActive] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings.data) return;
    setSiteUrl(settings.data.siteUrl ?? "");
    setDisplayName(settings.data.displayName);
    setActive(settings.data.configured ? settings.data.active : true);
  }, [settings.data]);

  const mutation = useMutation({
    mutationFn: () => save({ data: { siteUrl: siteUrl.trim() || null, displayName: displayName.trim() || null, active } }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ["property-agency-site"] });
      toast.success(
        res.selected > 0
          ? `Site-ul agenției a fost salvat. ${res.selected} anunțuri publicate au fost bifate pentru site.`
          : "Site-ul agenției a fost salvat.",
      );
    },
    onError: (e: Error) => toastError(e),
  });

  if (settings.isLoading) return <InlineLoading label="Se încarcă site-ul agenției…" />;
  if (settings.isError) return <QueryError error={settings.error} onRetry={() => settings.refetch()} />;
  const data = settings.data!;

  const submit = () => {
    try {
      normalizeAgencySiteUrl(siteUrl);
      setUrlError(null);
    } catch (e) {
      setUrlError(e instanceof Error ? e.message : "Adresa nu este validă.");
      return;
    }
    mutation.mutate();
  };

  return (
    <section id="site-agentie" className="space-y-4" aria-labelledby="agency-site-title">
      <div className="panel space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-muted"><Globe className="size-5" /></span>
            <div>
              <h3 id="agency-site-title" className="font-medium">Site-ul agenției</h3>
              <p className="text-sm text-muted-foreground">
                Portal privat al agenției tale: după activare apare în fiecare anunț și îl bifezi sau îl
                retragi ca pe orice portal. Feedul site-ului conține doar anunțurile bifate.
              </p>
            </div>
          </div>
          <StatusBadge tone={data.configured && data.active ? "success" : "neutral"}>
            {data.configured ? (data.active ? "Activ" : "Inactiv") : "Neconfigurat"}
          </StatusBadge>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="agency-site-url">Adresa site-ului</Label>
            <Input id="agency-site-url" type="url" inputMode="url" placeholder="https://agentia-mea.ro" value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)} aria-invalid={urlError ? true : undefined} />
            {urlError ? <p className="text-xs text-destructive">{urlError}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agency-site-name">Nume afișat</Label>
            <Input id="agency-site-name" maxLength={80} placeholder={data.agencyName} value={displayName}
              onChange={(e) => setDisplayName(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label htmlFor="agency-site-active" className="flex items-center gap-3 text-sm">
            <Switch id="agency-site-active" checked={active} onCheckedChange={setActive} />
            {active ? "Activ" : "Inactiv"}
          </label>
          <Button type="button" onClick={submit} disabled={mutation.isPending}>Salvează</Button>
        </div>
        {!active && data.configured && data.active ? (
          <p className="text-xs text-muted-foreground">Dacă dezactivezi site-ul, feedul lui nu mai răspunde până la reactivare.</p>
        ) : null}
      </div>
      <SiteFeedCard />
    </section>
  );
}

/** Setări → Integrări: scurtătură către noul loc al feedului. */
export function SiteFeedMovedCard({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="panel flex flex-wrap items-center justify-between gap-3 p-5">
      <div>
        <h3 className="font-medium">Feed pentru site-ul agenției</h3>
        <p className="text-sm text-muted-foreground">Feedul pentru site-ul agenției s-a mutat în Setări → Portaluri.</p>
      </div>
      <Button type="button" variant="outline" onClick={onOpen}>Deschide Site-ul agenției</Button>
    </div>
  );
}
