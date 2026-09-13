import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, Building2, Handshake, Layers, PlugZap, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { SectionCard } from "@/components/app/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-session";
import { appHead } from "@/components/app/app-head";
import { formatMoney } from "@/lib/format";
import { ACP_SCORE_LABELS, ACP_SCORE_WEIGHTS, ACP_THRESHOLDS } from "@/lib/acp/config";
import { propertyToSubject } from "@/lib/acp/adapters";
import { createAcpAnalysis } from "@/lib/acp/analyses.functions";


export const Route = createFileRoute("/_authenticated/app/acp/new")({
  head: () => appHead("Habitoo CRM — analiză comparativă nouă"),
  component: NewAcpPage,
});

const SOURCES = [
  {
    type: "own_properties" as const,
    name: "Proprietățile mele",
    icon: Building2,
    description: "Portofoliul agenției tale, inclusiv istoricul de prețuri.",
    available: true,
  },
  {
    type: "collaboration" as const,
    name: "Colaborare",
    icon: Handshake,
    description: "Ofertele deschise colaborării de către agențiile partenere.",
    available: true,
  },
  {
    type: "portal" as const,
    name: "Portaluri",
    icon: PlugZap,
    description: "Date normalizate din integrările autorizate (import în etapa următoare).",
    available: false,
  },
];

function NewAcpPage() {
  const { data: user } = useCurrentUser();
  const navigate = useNavigate();
  const orgId = user?.organization?.id ?? null;

  const [propertyId, setPropertyId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    own_properties: true,
    collaboration: true,
    portal: false,
  });

  const { data: properties } = useQuery({
    queryKey: ["acp-properties", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select(
          "id,title,reference,property_type,transaction_kind,city,county,district,lat,lng,rooms,usable_surface,surface,floor,building_floors,build_year,finish_state,parking,parking_spaces,balcony,furnishing,price,currency",
        )
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const selected = useMemo(
    () => (properties ?? []).find((p) => p.id === propertyId) ?? null,
    [properties, propertyId],
  );

  const subject = useMemo(() => (selected ? propertyToSubject(selected) : null), [selected]);

  const runAnalysis = useServerFn(createAcpAnalysis);

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId || !user) throw new Error("Lipsește agenția curentă.");
      if (!selected || !subject) throw new Error("Selectează proprietatea analizată.");
      const result = await runAnalysis({
        data: {
          propertyId: selected.id,
          title: title.trim() || undefined,
          sources: enabled,
        },
      });
      return result.analysisId;
    },
    onSuccess: (analysisId) => {
      toast.success("Analiză finalizată", {
        description: "Comparabilele au fost selectate și scorurile calculate.",
        duration: 2500,
      });
      navigate({ to: "/app/acp/$id", params: { id: analysisId } });
    },
    onError: toastError,
  });


  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="ACP"
        title="Analiză nouă"
        description="Alege proprietatea analizată și sursele de comparabile. Selecția și scorurile rămân deterministe și explicabile."
        backTo="/app/acp"
        backLabel="Analize salvate"
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard
            title="1. Proprietatea analizată"
            description="Datele se salvează ca snapshot în analiză."
            icon={Building2}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Proprietate</Label>
                <Select value={propertyId} onValueChange={setPropertyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selectează o proprietate din portofoliu" />
                  </SelectTrigger>
                  <SelectContent>
                    {(properties ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.reference ? `${p.reference} · ` : ""}
                        {p.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="acp-title">Titlul analizei</Label>
                <Input
                  id="acp-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={selected ? `ACP · ${selected.title}` : "ACP · …"}
                />
              </div>
            </div>

            {subject ? (
              <dl className="mt-5 grid grid-cols-2 gap-4 rounded-xl border border-border bg-muted/40 p-4 text-sm sm:grid-cols-4">
                {[
                  ["Camere", subject.rooms ?? "—"],
                  ["Suprafață utilă", subject.usableArea ? `${subject.usableArea} mp` : "—"],
                  ["Etaj", subject.floor ?? "—"],
                  ["Zonă", subject.neighborhood || subject.city || "—"],
                  ["An construcție", subject.constructionYear ?? "—"],
                  ["Stare", subject.condition || "—"],
                  ["Preț", formatMoney(subject.price, subject.currency)],
                  [
                    "Preț / mp",
                    subject.pricePerSqm ? formatMoney(subject.pricePerSqm, subject.currency) : "—",
                  ],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">
                      {label}
                    </dt>
                    <dd className="mt-0.5 font-medium">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </SectionCard>

          <SectionCard
            title="2. Surse pentru analiză"
            description="Alege de unde se colectează comparabilele."
            icon={Layers}
          >
            <ul className="space-y-3">
              {SOURCES.map((source) => (
                <li
                  key={source.type}
                  className="flex items-start gap-3 rounded-xl border border-border p-4"
                >
                  <Checkbox
                    id={`src-${source.type}`}
                    checked={Boolean(enabled[source.type])}
                    disabled={!source.available}
                    onCheckedChange={(v) =>
                      setEnabled((prev) => ({ ...prev, [source.type]: Boolean(v) }))
                    }
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <Label
                      htmlFor={`src-${source.type}`}
                      className="flex items-center gap-2 text-sm font-medium"
                    >
                      <source.icon className="size-4 text-muted-foreground" />
                      {source.name}
                    </Label>
                    <p className="mt-1 text-xs text-muted-foreground">{source.description}</p>
                  </div>
                  {!source.available ? (
                    <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      În curând
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </SectionCard>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              disabled={!selected || create.isPending}
              onClick={() => create.mutate(undefined)}
            >
              <Sparkles className="size-4" />
              {create.isPending ? "Se creează…" : "Analizează piața"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Motorul rulează imediat: selectează comparabilele, aplică ajustările și calculează
              statisticile, determinist și fără AI.
            </p>
          </div>
        </div>

        <SectionCard
          title="Cum se calculează scorul"
          description="Ponderi fixe, aceleași pentru orice analiză."
          icon={BarChart3}
        >
          <ul className="space-y-2 text-sm">
            {Object.entries(ACP_SCORE_WEIGHTS).map(([key, weight]) => (
              <li key={key} className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">
                  {ACP_SCORE_LABELS[key as keyof typeof ACP_SCORE_LABELS]}
                </span>
                <span className="font-medium">{weight}%</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Peste {ACP_THRESHOLDS.direct} puncte: comparabil direct. Între{" "}
            {ACP_THRESHOLDS.secondary} și {ACP_THRESHOLDS.direct}: comparabil secundar. Sub{" "}
            {ACP_THRESHOLDS.secondary}: exclus din analiza principală.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
